/**
 * Connector Learning Engine
 *
 * The main orchestrator that:
 * 1. Fetches API documentation from various sources
 * 2. Parses it into structured format using LLM
 * 3. Generates complete connector code
 * 4. Asks user for required credentials
 * 5. Runs tests to validate the connector
 */

import { DocFetcher, createDocFetcher } from './doc-fetcher';
import { APIParser, createAPIParser } from './api-parser';
import { CodeGenerator, createCodeGenerator } from './code-generator';
import type {
  LearningEngineConfig,
  LearningSession,
  LearningEvent,
  LearningEventHandler,
  APIDocumentation,
  ParsedAPI,
  GeneratedConnector,
  CredentialQuestion,
  LearningError,
} from './types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export class ConnectorLearningEngine {
  private config: LearningEngineConfig;
  private docFetcher: DocFetcher;
  private apiParser: APIParser;
  private codeGenerator: CodeGenerator;
  private eventHandlers: LearningEventHandler[] = [];
  private sessions: Map<string, LearningSession> = new Map();

  constructor(config: LearningEngineConfig) {
    this.config = config;
    this.docFetcher = createDocFetcher({ timeout: config.timeout });
    this.apiParser = createAPIParser({
      anthropicApiKey: config.anthropicApiKey,
      model: config.model,
    });
    this.codeGenerator = createCodeGenerator({
      anthropicApiKey: config.anthropicApiKey,
      model: config.model,
      includeTests: config.includeTests,
    });
  }

  /**
   * Subscribe to learning events
   */
  onEvent(handler: LearningEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Learn a new API from documentation
   */
  async learn(
    apiName: string,
    sources: string | string[],
    options: {
      crawl?: boolean;
      maxPages?: number;
    } = {}
  ): Promise<LearningSession> {
    const sessionId = `session_${Date.now()}`;
    const sourceList = Array.isArray(sources) ? sources : [sources];

    const session: LearningSession = {
      id: sessionId,
      status: 'analyzing',
      apiName,
      sources: [],
      questions: [],
      answers: {},
      errors: [],
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.emit({ type: 'started', apiName });

    try {
      // 1. Fetch documentation
      session.status = 'analyzing';
      const docs = await this.fetchDocumentation(sourceList, options);
      session.sources = docs;

      if (docs.length === 0) {
        throw new Error('No documentation could be fetched');
      }

      // 2. Parse API
      this.emit({ type: 'parsing', endpointCount: 0 });
      const parsedAPI = await this.parseAPI(docs);
      session.parsedAPI = parsedAPI;
      this.emit({ type: 'parsing', endpointCount: parsedAPI.endpoints.length });

      // 3. Generate credential questions
      session.questions = this.generateQuestions(parsedAPI);
      for (const question of session.questions) {
        this.emit({ type: 'question', question });
      }

      // 4. Generate connector code
      session.status = 'generating';
      this.emit({ type: 'generating', phase: 'types' });
      const connector = await this.codeGenerator.generateConnector(parsedAPI);
      session.generatedConnector = connector;

      // 5. Write files if output directory specified
      if (this.config.outputDir) {
        await this.writeConnectorFiles(connector);
      }

      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      this.emit({ type: 'completed', connector });

      return session;
    } catch (error) {
      const learningError: LearningError = {
        phase: 'generate',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
      session.errors.push(learningError);
      session.status = 'failed';
      this.emit({ type: 'error', error: learningError });
      throw error;
    }
  }

  /**
   * Learn from OpenAPI/Swagger specification
   */
  async learnFromOpenAPI(
    apiName: string,
    openApiUrl: string
  ): Promise<LearningSession> {
    const sessionId = `session_${Date.now()}`;

    const session: LearningSession = {
      id: sessionId,
      status: 'analyzing',
      apiName,
      sources: [],
      questions: [],
      answers: {},
      errors: [],
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.emit({ type: 'started', apiName });

    try {
      // 1. Fetch OpenAPI spec
      this.emit({ type: 'fetching', source: openApiUrl });
      const doc = await this.docFetcher.parseOpenAPI(openApiUrl);
      session.sources = [doc];

      // 2. Parse directly
      const spec = JSON.parse(doc.content);
      const parsedAPI = await this.apiParser.parseOpenAPI(spec);
      parsedAPI.name = apiName;
      session.parsedAPI = parsedAPI;
      this.emit({ type: 'parsing', endpointCount: parsedAPI.endpoints.length });

      // 3. Generate questions
      session.questions = this.generateQuestions(parsedAPI);
      for (const question of session.questions) {
        this.emit({ type: 'question', question });
      }

      // 4. Generate connector
      session.status = 'generating';
      this.emit({ type: 'generating', phase: 'connector' });
      const connector = await this.codeGenerator.generateConnector(parsedAPI);
      session.generatedConnector = connector;

      // 5. Write files
      if (this.config.outputDir) {
        await this.writeConnectorFiles(connector);
      }

      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      this.emit({ type: 'completed', connector });

      return session;
    } catch (error) {
      const learningError: LearningError = {
        phase: 'parse',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
      session.errors.push(learningError);
      session.status = 'failed';
      this.emit({ type: 'error', error: learningError });
      throw error;
    }
  }

  /**
   * Continue a session by providing answers to questions
   */
  async continueSession(
    sessionId: string,
    answers: Record<string, string>
  ): Promise<LearningSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.answers = { ...session.answers, ...answers };

    // Mark answered questions
    for (const question of session.questions) {
      if (answers[question.credentialName]) {
        question.answered = true;
      }
    }

    // Check if all required questions are answered
    const unanswered = session.questions.filter((q) => q.required && !q.answered);
    if (unanswered.length > 0) {
      return session;
    }

    // If we have test credentials, run tests
    if (this.config.testCredentials && session.generatedConnector) {
      session.status = 'testing';
      // Tests would run here
      this.emit({ type: 'testing', testCount: session.generatedConnector.actions.length });
    }

    return session;
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): LearningSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ============ Private Methods ============

  private async fetchDocumentation(
    sources: string[],
    options: { crawl?: boolean; maxPages?: number }
  ): Promise<APIDocumentation[]> {
    const docs: APIDocumentation[] = [];

    for (const source of sources) {
      this.emit({ type: 'fetching', source });

      try {
        if (source.startsWith('http')) {
          if (options.crawl) {
            const crawled = await this.docFetcher.crawlDocumentation(source, {
              maxPages: options.maxPages,
            });
            docs.push(...crawled);
          } else {
            const doc = await this.docFetcher.fetchUrl(source);
            docs.push(doc);
          }
        } else {
          // Treat as raw content
          docs.push(this.docFetcher.parseRaw(source));
        }
      } catch (error) {
        const err: LearningError = {
          phase: 'fetch',
          message: `Failed to fetch ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        // Continue with other sources
        console.error(err.message);
      }
    }

    return docs;
  }

  private async parseAPI(docs: APIDocumentation[]): Promise<ParsedAPI> {
    // Check if any doc is OpenAPI
    const openApiDoc = docs.find((d) => d.source === 'openapi');
    if (openApiDoc) {
      const spec = JSON.parse(openApiDoc.content);
      return this.apiParser.parseOpenAPI(spec);
    }

    // Parse from documentation
    return this.apiParser.parseDocumentation(docs);
  }

  private generateQuestions(api: ParsedAPI): CredentialQuestion[] {
    return api.requiredCredentials.map((cred, i) => ({
      id: `q_${i}`,
      question: this.formatQuestion(cred),
      credentialName: cred.name,
      type: cred.type,
      required: cred.required,
      hint: cred.validationHint,
      answered: false,
    }));
  }

  private formatQuestion(cred: { name: string; description: string; example?: string }): string {
    let question = `Please provide your ${cred.description || cred.name}`;
    if (cred.example) {
      question += ` (example: ${cred.example})`;
    }
    return question;
  }

  private async writeConnectorFiles(connector: GeneratedConnector): Promise<void> {
    const baseDir = join(
      this.config.outputDir!,
      'connectors',
      'implementations',
      connector.id
    );

    // Create directories
    await mkdir(baseDir, { recursive: true });
    await mkdir(join(baseDir, 'src'), { recursive: true });
    await mkdir(join(baseDir, 'src', '__tests__'), { recursive: true });

    // Write files
    for (const file of connector.files) {
      const filePath = join(baseDir, file.path);
      await writeFile(filePath, file.content, 'utf-8');
    }

    console.log(`Connector written to ${baseDir}`);
  }

  private emit(event: LearningEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Event handler error:', err);
      }
    }
  }
}

export function createLearningEngine(config: LearningEngineConfig): ConnectorLearningEngine {
  return new ConnectorLearningEngine(config);
}

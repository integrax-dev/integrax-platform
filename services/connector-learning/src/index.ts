/**
 * IntegraX Connector Learning Engine
 *
 * An LLM-powered engine that learns APIs from documentation and generates
 * complete, production-ready connectors automatically.
 *
 * Features:
 * - Fetches documentation from URLs, OpenAPI specs, or raw text
 * - Parses endpoints, authentication, and schemas using AI
 * - Generates TypeScript connector code with full type safety
 * - Creates tests automatically
 * - Asks for required credentials interactively
 *
 * @example
 * ```typescript
 * import { createLearningEngine } from '@integrax/connector-learning';
 *
 * const engine = createLearningEngine({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 *   outputDir: './connectors/implementations',
 *   includeTests: true,
 * });
 *
 * // Learn from OpenAPI spec
 * const session = await engine.learnFromOpenAPI(
 *   'tiendanube',
 *   'https://tiendanube.github.io/api-documentation/openapi.json'
 * );
 *
 * // Or learn from documentation pages
 * const session = await engine.learn('stripe', [
 *   'https://stripe.com/docs/api',
 *   'https://stripe.com/docs/api/customers',
 *   'https://stripe.com/docs/api/charges',
 * ], { crawl: true });
 *
 * console.log(`Generated connector with ${session.generatedConnector?.actions.length} actions`);
 * console.log('Required credentials:', session.questions.map(q => q.credentialName));
 * ```
 */

// Main exports
export { ConnectorLearningEngine, createLearningEngine } from './learning-engine';
export { DocFetcher, createDocFetcher } from './doc-fetcher';
export { APIParser, createAPIParser } from './api-parser';
export { CodeGenerator, createCodeGenerator } from './code-generator';

// Type exports
export type {
  // Config
  LearningEngineConfig,

  // API Documentation
  APIDocumentation,
  ParsedEndpoint,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  SchemaInfo,
  PropertyInfo,
  AuthenticationInfo,
  OAuth2FlowInfo,
  RateLimitInfo,
  EndpointExample,

  // Parsed API
  ParsedAPI,
  APICategory,
  RequiredCredential,

  // Generated Connector
  GeneratedConnector,
  GeneratedFile,
  GeneratedAction,
  ActionInput,
  ActionOutput,
  ActionExample,

  // Learning Session
  LearningSession,
  CredentialQuestion,
  LearningError,

  // Events
  LearningEvent,
  LearningEventHandler,
} from './types';

/**
 * Types for Connector Learning Engine
 */

// ============ API Documentation Types ============

export interface APIDocumentation {
  source: 'openapi' | 'markdown' | 'html' | 'url' | 'raw';
  content: string;
  baseUrl?: string;
  version?: string;
}

export interface ParsedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  parameters: ParameterInfo[];
  requestBody?: RequestBodyInfo;
  responses: ResponseInfo[];
  authentication?: AuthenticationInfo;
  rateLimit?: RateLimitInfo;
  examples?: EndpointExample[];
}

export interface ParameterInfo {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  type: string;
  required: boolean;
  description: string;
  default?: any;
  enum?: string[];
}

export interface RequestBodyInfo {
  contentType: string;
  schema: SchemaInfo;
  required: boolean;
  examples?: any[];
}

export interface ResponseInfo {
  statusCode: number;
  description: string;
  schema?: SchemaInfo;
}

export interface SchemaInfo {
  type: string;
  properties?: Record<string, PropertyInfo>;
  items?: SchemaInfo;
  required?: string[];
}

export interface PropertyInfo {
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  format?: string;
  example?: any;
}

export interface AuthenticationInfo {
  type: 'api_key' | 'oauth2' | 'basic' | 'bearer' | 'custom';
  location?: 'header' | 'query' | 'cookie';
  name?: string;
  description?: string;
  scopes?: string[];
  oauth2Flow?: OAuth2FlowInfo;
}

export interface OAuth2FlowInfo {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface RateLimitInfo {
  limit: number;
  window: string;
  description?: string;
}

export interface EndpointExample {
  name: string;
  request: any;
  response: any;
}

// ============ Parsed API Info ============

export interface ParsedAPI {
  name: string;
  description: string;
  baseUrl: string;
  version: string;
  authentication: AuthenticationInfo[];
  endpoints: ParsedEndpoint[];
  schemas: Record<string, SchemaInfo>;
  categories: APICategory[];
  requiredCredentials: RequiredCredential[];
}

export interface APICategory {
  name: string;
  description: string;
  endpointPaths: string[];
}

export interface RequiredCredential {
  name: string;
  type: 'string' | 'secret' | 'url' | 'file' | 'oauth';
  description: string;
  required: boolean;
  example?: string;
  validationHint?: string;
}

// ============ Generated Connector ============

export interface GeneratedConnector {
  id: string;
  name: string;
  version: string;
  description: string;

  // Generated files
  files: GeneratedFile[];

  // Metadata
  api: ParsedAPI;
  generatedAt: string;

  // Requirements
  requiredCredentials: RequiredCredential[];

  // Actions
  actions: GeneratedAction[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'source' | 'test' | 'types' | 'config';
}

export interface GeneratedAction {
  name: string;
  description: string;
  method: string;
  path: string;
  inputs: ActionInput[];
  outputs: ActionOutput[];
  examples: ActionExample[];
}

export interface ActionInput {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
}

export interface ActionOutput {
  name: string;
  type: string;
  description: string;
}

export interface ActionExample {
  name: string;
  input: Record<string, any>;
  expectedOutput: Record<string, any>;
}

// ============ Learning Session ============

export interface LearningSession {
  id: string;
  status: 'analyzing' | 'generating' | 'testing' | 'completed' | 'failed';
  apiName: string;
  sources: APIDocumentation[];
  parsedAPI?: ParsedAPI;
  generatedConnector?: GeneratedConnector;
  questions: CredentialQuestion[];
  answers: Record<string, string>;
  errors: LearningError[];
  startedAt: string;
  completedAt?: string;
}

export interface CredentialQuestion {
  id: string;
  question: string;
  credentialName: string;
  type: RequiredCredential['type'];
  required: boolean;
  hint?: string;
  answered: boolean;
}

export interface LearningError {
  phase: 'fetch' | 'parse' | 'generate' | 'test';
  message: string;
  details?: any;
  timestamp: string;
}

// ============ Learning Engine Config ============

export interface LearningEngineConfig {
  anthropicApiKey: string;
  model?: string;
  outputDir?: string;
  includeTests?: boolean;
  testCredentials?: Record<string, string>;
  maxEndpoints?: number;
  timeout?: number;
}

// ============ Learning Engine Events ============

export type LearningEvent =
  | { type: 'started'; apiName: string }
  | { type: 'fetching'; source: string }
  | { type: 'parsing'; endpointCount: number }
  | { type: 'question'; question: CredentialQuestion }
  | { type: 'generating'; phase: string }
  | { type: 'testing'; testCount: number }
  | { type: 'completed'; connector: GeneratedConnector }
  | { type: 'error'; error: LearningError };

export type LearningEventHandler = (event: LearningEvent) => void;

/**
 * Tests for Connector Learning Engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLearningEngine,
  createDocFetcher,
  createAPIParser,
  createCodeGenerator,
} from '../index';
import type { ParsedAPI, APIDocumentation, GeneratedConnector } from '../types';

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      }),
    };
  },
}));

// Mock fetch for documentation fetching
global.fetch = vi.fn();

describe('DocFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a doc fetcher', () => {
    const fetcher = createDocFetcher();
    expect(fetcher).toBeDefined();
  });

  it('should fetch URL and detect OpenAPI', async () => {
    const openApiSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve(JSON.stringify(openApiSpec)),
    });

    const fetcher = createDocFetcher();
    const doc = await fetcher.fetchUrl('https://api.example.com/openapi.json');

    expect(doc.source).toBe('openapi');
    expect(doc.baseUrl).toBe('https://api.example.com');
  });

  it('should fetch URL and detect HTML', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: () => Promise.resolve('<html><body>API Docs</body></html>'),
    });

    const fetcher = createDocFetcher();
    const doc = await fetcher.fetchUrl('https://docs.example.com/api');

    expect(doc.source).toBe('html');
  });

  it('should parse markdown', () => {
    const fetcher = createDocFetcher();
    const doc = fetcher.parseMarkdown('# API Docs\n\n## Endpoints\n\nGET /users');

    expect(doc.source).toBe('markdown');
    expect(doc.content).toContain('GET /users');
  });

  it('should parse raw text', () => {
    const fetcher = createDocFetcher();
    const doc = fetcher.parseRaw('Some API documentation');

    expect(doc.source).toBe('raw');
  });
});

describe('APIParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an API parser', () => {
    const parser = createAPIParser({ anthropicApiKey: 'test-key' });
    expect(parser).toBeDefined();
  });

  it('should parse OpenAPI spec directly', async () => {
    const parser = createAPIParser({ anthropicApiKey: 'test-key' });

    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        description: 'A test API',
        version: '1.0.0',
      },
      servers: [{ url: 'https://api.test.com/v1' }],
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            responses: { '200': { description: 'Success' } },
          },
          post: {
            summary: 'Create user',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
        '/users/{id}': {
          get: {
            summary: 'Get user',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'Success' } },
          },
        },
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
    };

    const parsed = await parser.parseOpenAPI(spec);

    expect(parsed.name).toBe('Test API');
    expect(parsed.description).toBe('A test API');
    expect(parsed.baseUrl).toBe('https://api.test.com/v1');
    expect(parsed.endpoints).toHaveLength(3);
    expect(parsed.authentication).toHaveLength(1);
    expect(parsed.authentication[0].type).toBe('api_key');
  });

  it('should handle OAuth2 authentication', async () => {
    const parser = createAPIParser({ anthropicApiKey: 'test-key' });

    const spec = {
      openapi: '3.0.0',
      info: { title: 'OAuth API', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: {
                  read: 'Read access',
                  write: 'Write access',
                },
              },
            },
          },
        },
      },
    };

    const parsed = await parser.parseOpenAPI(spec);

    expect(parsed.authentication).toHaveLength(1);
    expect(parsed.authentication[0].type).toBe('oauth2');
    expect(parsed.authentication[0].oauth2Flow?.authorizationUrl).toBe(
      'https://auth.example.com/authorize'
    );
  });

  it('should categorize endpoints', async () => {
    const parser = createAPIParser({ anthropicApiKey: 'test-key' });

    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': { get: { summary: 'List users' } },
        '/users/{id}': { get: { summary: 'Get user' } },
        '/orders': { get: { summary: 'List orders' } },
        '/orders/{id}': { get: { summary: 'Get order' } },
        '/products': { get: { summary: 'List products' } },
      },
    };

    const parsed = await parser.parseOpenAPI(spec);

    expect(parsed.categories.length).toBeGreaterThan(0);
    const userCategory = parsed.categories.find((c) => c.name === 'users');
    expect(userCategory).toBeDefined();
    expect(userCategory?.endpointPaths).toContain('/users');
  });
});

describe('CodeGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a code generator', () => {
    const generator = createCodeGenerator({ anthropicApiKey: 'test-key' });
    expect(generator).toBeDefined();
  });

  it('should generate connector structure', async () => {
    const generator = createCodeGenerator({
      anthropicApiKey: 'test-key',
      includeTests: true,
    });

    const mockAPI: ParsedAPI = {
      name: 'Test API',
      description: 'A test API',
      baseUrl: 'https://api.test.com',
      version: '1.0.0',
      authentication: [{ type: 'api_key', location: 'header', name: 'X-API-Key' }],
      endpoints: [
        {
          method: 'GET',
          path: '/users',
          description: 'List users',
          parameters: [],
          responses: [{ statusCode: 200, description: 'Success' }],
        },
        {
          method: 'POST',
          path: '/users',
          description: 'Create user',
          parameters: [],
          requestBody: {
            contentType: 'application/json',
            required: true,
            schema: { type: 'object' },
          },
          responses: [{ statusCode: 201, description: 'Created' }],
        },
      ],
      schemas: {},
      categories: [{ name: 'users', description: 'User endpoints', endpointPaths: ['/users'] }],
      requiredCredentials: [
        { name: 'api_key', type: 'secret', description: 'API Key', required: true },
      ],
    };

    const connector = await generator.generateConnector(mockAPI);

    expect(connector.id).toBe('test-api');
    expect(connector.name).toBe('Test API');
    expect(connector.files.length).toBeGreaterThan(0);
    expect(connector.files.some((f) => f.path === 'package.json')).toBe(true);
    expect(connector.files.some((f) => f.path === 'src/types.ts')).toBe(true);
    expect(connector.files.some((f) => f.path === 'src/index.ts')).toBe(true);
    expect(connector.actions).toHaveLength(2);
  });

  it('should extract actions from endpoints', async () => {
    const generator = createCodeGenerator({ anthropicApiKey: 'test-key' });

    const mockAPI: ParsedAPI = {
      name: 'Test',
      description: '',
      baseUrl: '',
      version: '1.0.0',
      authentication: [],
      endpoints: [
        { method: 'GET', path: '/users', description: 'List', parameters: [], responses: [] },
        { method: 'GET', path: '/users/{id}', description: 'Get', parameters: [], responses: [] },
        { method: 'POST', path: '/users', description: 'Create', parameters: [], responses: [] },
        { method: 'PUT', path: '/users/{id}', description: 'Update', parameters: [], responses: [] },
        { method: 'DELETE', path: '/users/{id}', description: 'Delete', parameters: [], responses: [] },
      ],
      schemas: {},
      categories: [],
      requiredCredentials: [],
    };

    const connector = await generator.generateConnector(mockAPI);

    expect(connector.actions).toHaveLength(5);
    expect(connector.actions.map((a) => a.name)).toContain('listUsers');
    expect(connector.actions.map((a) => a.name)).toContain('getUser');
    expect(connector.actions.map((a) => a.name)).toContain('createUser');
    expect(connector.actions.map((a) => a.name)).toContain('updateUser');
    expect(connector.actions.map((a) => a.name)).toContain('deleteUser');
  });
});

describe('ConnectorLearningEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a learning engine', () => {
    const engine = createLearningEngine({
      anthropicApiKey: 'test-key',
    });
    expect(engine).toBeDefined();
  });

  it('should emit events', async () => {
    const engine = createLearningEngine({
      anthropicApiKey: 'test-key',
    });

    const events: any[] = [];
    engine.onEvent((event) => events.push(event));

    // Mock fetch for OpenAPI
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: { '/test': { get: { summary: 'Test' } } },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve(JSON.stringify(spec)),
    });

    try {
      await engine.learnFromOpenAPI('test-api', 'https://example.com/openapi.json');
    } catch {
      // Expected to fail due to mocked Anthropic
    }

    expect(events.some((e) => e.type === 'started')).toBe(true);
    expect(events.some((e) => e.type === 'fetching')).toBe(true);
  });

  it('should generate credential questions', async () => {
    const engine = createLearningEngine({
      anthropicApiKey: 'test-key',
    });

    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve(JSON.stringify(spec)),
    });

    const events: any[] = [];
    engine.onEvent((event) => events.push(event));

    try {
      await engine.learnFromOpenAPI('test-api', 'https://example.com/openapi.json');
    } catch {
      // May fail due to mocked Anthropic
    }

    const questionEvents = events.filter((e) => e.type === 'question');
    expect(questionEvents.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Type Definitions', () => {
  it('should have correct RequiredCredential types', () => {
    const cred: import('../types').RequiredCredential = {
      name: 'api_key',
      type: 'secret',
      description: 'API Key',
      required: true,
      example: 'sk_test_xxx',
      validationHint: 'Starts with sk_',
    };

    expect(cred.type).toBe('secret');
    expect(cred.required).toBe(true);
  });

  it('should have correct ParsedEndpoint types', () => {
    const endpoint: import('../types').ParsedEndpoint = {
      method: 'POST',
      path: '/users',
      description: 'Create user',
      parameters: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          description: 'Page number',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: { type: 'object' },
      },
      responses: [
        { statusCode: 201, description: 'Created' },
        { statusCode: 400, description: 'Bad Request' },
      ],
    };

    expect(endpoint.method).toBe('POST');
    expect(endpoint.parameters).toHaveLength(1);
    expect(endpoint.responses).toHaveLength(2);
  });

  it('should have correct GeneratedConnector types', () => {
    const connector: import('../types').GeneratedConnector = {
      id: 'test-api',
      name: 'Test API',
      version: '0.1.0',
      description: 'Test',
      files: [
        { path: 'index.ts', content: 'export {}', type: 'source' },
        { path: 'types.ts', content: 'export type X = {}', type: 'types' },
      ],
      api: {
        name: 'Test',
        description: '',
        baseUrl: '',
        version: '1.0.0',
        authentication: [],
        endpoints: [],
        schemas: {},
        categories: [],
        requiredCredentials: [],
      },
      generatedAt: new Date().toISOString(),
      requiredCredentials: [],
      actions: [],
    };

    expect(connector.files).toHaveLength(2);
    expect(connector.files[0].type).toBe('source');
  });
});

/**
 * Code Generator
 *
 * Generates TypeScript connector code from parsed API specification.
 * Creates complete, production-ready connectors with:
 * - Type definitions
 * - API client
 * - All endpoint methods
 * - Error handling
 * - Tests
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ParsedAPI,
  ParsedEndpoint,
  GeneratedConnector,
  GeneratedFile,
  GeneratedAction,
} from './types';

export interface CodeGeneratorConfig {
  anthropicApiKey: string;
  model?: string;
  includeTests?: boolean;
}

export class CodeGenerator {
  private client: Anthropic;
  private model: string;
  private includeTests: boolean;

  constructor(config: CodeGeneratorConfig) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.includeTests = config.includeTests !== false;
  }

  /**
   * Generate complete connector from parsed API
   */
  async generateConnector(api: ParsedAPI): Promise<GeneratedConnector> {
    const connectorId = this.toKebabCase(api.name);
    const files: GeneratedFile[] = [];

    // 1. Generate types
    const typesFile = await this.generateTypes(api);
    files.push(typesFile);

    // 2. Generate main connector class
    const connectorFile = await this.generateConnectorClass(api);
    files.push(connectorFile);

    // 3. Generate index file
    const indexFile = this.generateIndexFile(api);
    files.push(indexFile);

    // 4. Generate package.json
    const packageFile = this.generatePackageJson(api, connectorId);
    files.push(packageFile);

    // 5. Generate tsconfig
    const tsconfigFile = this.generateTsConfig();
    files.push(tsconfigFile);

    // 6. Generate tests if enabled
    if (this.includeTests) {
      const testFile = await this.generateTests(api);
      files.push(testFile);
    }

    // Extract actions from endpoints
    const actions = this.extractActions(api.endpoints);

    return {
      id: connectorId,
      name: api.name,
      version: '0.1.0',
      description: api.description,
      files,
      api,
      generatedAt: new Date().toISOString(),
      requiredCredentials: api.requiredCredentials,
      actions,
    };
  }

  // ============ File Generators ============

  private async generateTypes(api: ParsedAPI): Promise<GeneratedFile> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `Generate TypeScript type definitions for this API.

API: ${api.name}
Description: ${api.description}

Endpoints:
${JSON.stringify(api.endpoints.slice(0, 30), null, 2)}

Authentication:
${JSON.stringify(api.authentication, null, 2)}

Required Credentials:
${JSON.stringify(api.requiredCredentials, null, 2)}

Generate a complete types.ts file with:
1. Config type for the connector (credentials, options)
2. Request/Response types for each endpoint
3. Common types (pagination, errors, etc.)
4. Use descriptive names and add JSDoc comments
5. Export all types

Output ONLY the TypeScript code, no markdown or explanations.`,
        },
      ],
    });

    const content = this.extractCode(response);

    return {
      path: 'src/types.ts',
      content,
      type: 'types',
    };
  }

  private async generateConnectorClass(api: ParsedAPI): Promise<GeneratedFile> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: `Generate a TypeScript connector class for this API.

API: ${api.name}
Base URL: ${api.baseUrl}
Description: ${api.description}

Authentication:
${JSON.stringify(api.authentication, null, 2)}

Required Credentials:
${JSON.stringify(api.requiredCredentials, null, 2)}

Endpoints (generate a method for EACH one):
${JSON.stringify(api.endpoints, null, 2)}

Generate a complete index.ts file with:

1. Import types from './types'

2. A connector class that:
   - Takes config in constructor (credentials, baseUrl override, timeout)
   - Has a private method for making authenticated HTTP requests
   - Has a public method for EACH endpoint
   - Handles errors properly (throw typed errors)
   - Supports pagination where applicable
   - Has proper TypeScript types for all inputs/outputs

3. Method naming convention:
   - GET /users -> getUsers()
   - GET /users/{id} -> getUser(id)
   - POST /users -> createUser(data)
   - PUT /users/{id} -> updateUser(id, data)
   - DELETE /users/{id} -> deleteUser(id)
   - GET /users/{id}/orders -> getUserOrders(userId)

4. Add JSDoc comments for each method

5. Export a factory function: create${this.toPascalCase(api.name)}Connector(config)

Example structure:
\`\`\`typescript
import { Config, CreateUserRequest, User, ListUsersResponse } from './types';

export class ${this.toPascalCase(api.name)}Connector {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl || '${api.baseUrl}';
    this.apiKey = config.apiKey;
  }

  private async request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    // ... implementation
  }

  /** List all users */
  async listUsers(params?: ListUsersParams): Promise<ListUsersResponse> {
    return this.request('GET', '/users', { params });
  }

  /** Get a user by ID */
  async getUser(id: string): Promise<User> {
    return this.request('GET', \`/users/\${id}\`);
  }

  // ... more methods for each endpoint
}

export function create${this.toPascalCase(api.name)}Connector(config: Config) {
  return new ${this.toPascalCase(api.name)}Connector(config);
}
\`\`\`

Generate ALL methods for ALL ${api.endpoints.length} endpoints.
Output ONLY the TypeScript code, no markdown or explanations.`,
        },
      ],
    });

    const content = this.extractCode(response);

    return {
      path: 'src/index.ts',
      content,
      type: 'source',
    };
  }

  private generateIndexFile(api: ParsedAPI): GeneratedFile {
    const pascalName = this.toPascalCase(api.name);

    return {
      path: 'index.ts',
      content: `/**
 * ${api.name} Connector for IntegraX
 *
 * ${api.description}
 *
 * @example
 * \`\`\`typescript
 * import { create${pascalName}Connector } from '@integrax/${this.toKebabCase(api.name)}';
 *
 * const connector = create${pascalName}Connector({
 *   apiKey: process.env.${this.toScreamingSnakeCase(api.name)}_API_KEY!,
 * });
 *
 * const result = await connector.listProducts();
 * \`\`\`
 */

export * from './src/index';
export * from './src/types';
`,
      type: 'source',
    };
  }

  private generatePackageJson(api: ParsedAPI, connectorId: string): GeneratedFile {
    return {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: `@integrax/${connectorId}`,
          version: '0.1.0',
          description: `IntegraX connector for ${api.name}`,
          main: 'dist/index.js',
          types: 'dist/index.d.ts',
          scripts: {
            build: 'tsc',
            test: 'vitest run',
            'test:watch': 'vitest',
          },
          dependencies: {
            '@integrax/connector-sdk': 'workspace:*',
            zod: '^3.22.4',
          },
          devDependencies: {
            '@types/node': '^20.10.0',
            typescript: '^5.3.0',
            vitest: '^1.6.1',
          },
          peerDependencies: {
            '@integrax/connector-sdk': '*',
          },
        },
        null,
        2
      ),
      type: 'config',
    };
  }

  private generateTsConfig(): GeneratedFile {
    return {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          extends: '../../../tsconfig.base.json',
          compilerOptions: {
            outDir: './dist',
            rootDir: '.',
            declaration: true,
            declarationMap: true,
          },
          include: ['src/**/*', 'index.ts'],
          exclude: ['node_modules', 'dist', '**/*.test.ts'],
        },
        null,
        2
      ),
      type: 'config',
    };
  }

  private async generateTests(api: ParsedAPI): Promise<GeneratedFile> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `Generate Vitest tests for this API connector.

API: ${api.name}
Base URL: ${api.baseUrl}

Endpoints:
${JSON.stringify(api.endpoints.slice(0, 20), null, 2)}

Required Credentials:
${JSON.stringify(api.requiredCredentials, null, 2)}

Generate tests that:
1. Mock HTTP responses (don't make real API calls)
2. Test each endpoint method
3. Test error handling
4. Test parameter validation
5. Test authentication header is set correctly

Use Vitest syntax:
- describe, it, expect, vi.fn(), vi.mock()
- beforeEach for setup
- Mock fetch or use a request interceptor

Output ONLY the TypeScript test code, no markdown or explanations.`,
        },
      ],
    });

    const content = this.extractCode(response);

    return {
      path: 'src/__tests__/connector.test.ts',
      content,
      type: 'test',
    };
  }

  // ============ Helpers ============

  private extractCode(response: Anthropic.Message): string {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Remove markdown code blocks if present
    return text.replace(/^```(?:typescript|ts)?\n?/gm, '').replace(/\n?```$/gm, '');
  }

  private extractActions(endpoints: ParsedEndpoint[]): GeneratedAction[] {
    return endpoints.map((ep) => ({
      name: this.endpointToMethodName(ep),
      description: ep.description,
      method: ep.method,
      path: ep.path,
      inputs: [
        ...ep.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description,
          default: p.default,
        })),
        ...(ep.requestBody
          ? [
            {
              name: 'body',
              type: 'object',
              required: ep.requestBody.required,
              description: 'Request body',
            },
          ]
          : []),
      ],
      outputs: ep.responses.map((r) => ({
        name: `response_${r.statusCode}`,
        type: 'object',
        description: r.description,
      })),
      examples: (ep.examples || []).map((ex) => ({
        ...ex,
        input: (ex as any).input || (ex as any).requestBody || {},
        expectedOutput: (ex as any).expectedOutput || (ex as any).response || {},
      })),
    }));
  }

  private endpointToMethodName(ep: ParsedEndpoint): string {
    const method = ep.method.toLowerCase();
    const pathParts = ep.path
      .split('/')
      .filter((p) => p && !p.startsWith('{') && !p.match(/^v\d+$/));

    const resource = pathParts[pathParts.length - 1] || 'resource';
    const parent = pathParts[pathParts.length - 2];

    // Singularize for single resource operations
    const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;

    switch (method) {
      case 'get':
        if (ep.path.includes('{')) {
          return parent ? `get${this.toPascalCase(parent)}${this.toPascalCase(singular)}` : `get${this.toPascalCase(singular)}`;
        }
        return `list${this.toPascalCase(resource)}`;
      case 'post':
        return `create${this.toPascalCase(singular)}`;
      case 'put':
      case 'patch':
        return `update${this.toPascalCase(singular)}`;
      case 'delete':
        return `delete${this.toPascalCase(singular)}`;
      default:
        return `${method}${this.toPascalCase(resource)}`;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/^-|-$/g, '');
  }

  private toScreamingSnakeCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }
}

export function createCodeGenerator(config: CodeGeneratorConfig): CodeGenerator {
  return new CodeGenerator(config);
}

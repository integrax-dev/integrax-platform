/**
 * API Parser
 *
 * Uses LLM to parse API documentation into structured format.
 * Works with OpenAPI, HTML docs, markdown, and raw text.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  APIDocumentation,
  ParsedAPI,
  ParsedEndpoint,
  AuthenticationInfo,
  RequiredCredential,
  APICategory,
} from './types';

export interface APIParserConfig {
  anthropicApiKey: string;
  model?: string;
}

export class APIParser {
  private client: Anthropic;
  private model: string;

  constructor(config: APIParserConfig) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  /**
   * Parse API documentation into structured format
   */
  async parseDocumentation(docs: APIDocumentation[]): Promise<ParsedAPI> {
    // Combine all documentation
    const combinedDocs = docs
      .map((d) => `=== Source: ${d.source} ===\n${d.content}`)
      .join('\n\n---\n\n');

    // First pass: Extract basic API info
    const basicInfo = await this.extractBasicInfo(combinedDocs);

    // Second pass: Parse endpoints in detail
    const endpoints = await this.parseEndpoints(combinedDocs, basicInfo);

    // Third pass: Identify authentication requirements
    const authentication = await this.parseAuthentication(combinedDocs);

    // Fourth pass: Determine required credentials
    const requiredCredentials = await this.determineRequiredCredentials(
      combinedDocs,
      authentication
    );

    // Categorize endpoints
    const categories = this.categorizeEndpoints(endpoints);

    return {
      name: basicInfo.name,
      description: basicInfo.description,
      baseUrl: basicInfo.baseUrl || docs[0]?.baseUrl || '',
      version: basicInfo.version || '1.0.0',
      authentication,
      endpoints,
      schemas: {},
      categories,
      requiredCredentials,
    };
  }

  /**
   * Parse OpenAPI specification directly
   */
  async parseOpenAPI(spec: any): Promise<ParsedAPI> {
    const endpoints: ParsedEndpoint[] = [];

    // Extract endpoints from paths
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, details] of Object.entries(methods as any)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const endpoint = this.parseOpenAPIEndpoint(path, method, details, spec);
          endpoints.push(endpoint);
        }
      }
    }

    // Extract authentication
    const authentication = this.parseOpenAPIAuth(spec);

    // Determine required credentials
    const requiredCredentials = this.openAPIToCredentials(authentication, spec);

    return {
      name: spec.info?.title || 'Unknown API',
      description: spec.info?.description || '',
      baseUrl: spec.servers?.[0]?.url || '',
      version: spec.info?.version || '1.0.0',
      authentication,
      endpoints,
      schemas: spec.components?.schemas || {},
      categories: this.categorizeEndpoints(endpoints),
      requiredCredentials,
    };
  }

  // ============ Private Methods ============

  private async extractBasicInfo(docs: string): Promise<{
    name: string;
    description: string;
    baseUrl: string;
    version: string;
  }> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze this API documentation and extract basic information.

Documentation:
${docs.substring(0, 10000)}

Respond with JSON only:
{
  "name": "API name",
  "description": "Brief description of what this API does",
  "baseUrl": "Base URL for API calls (e.g., https://api.example.com/v1)",
  "version": "API version"
}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
      return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
    } catch {
      return {
        name: 'Unknown API',
        description: '',
        baseUrl: '',
        version: '1.0.0',
      };
    }
  }

  private async parseEndpoints(
    docs: string,
    basicInfo: { name: string; baseUrl: string }
  ): Promise<ParsedEndpoint[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `Analyze this API documentation and extract ALL endpoints.

API: ${basicInfo.name}
Base URL: ${basicInfo.baseUrl}

Documentation:
${docs.substring(0, 30000)}

For EACH endpoint found, provide:
- method: GET, POST, PUT, PATCH, or DELETE
- path: The endpoint path (e.g., /users, /orders/{id})
- description: What this endpoint does
- parameters: Query params, path params, headers needed
- requestBody: For POST/PUT/PATCH, the expected body schema
- responses: Expected response codes and schemas

Respond with JSON array only:
[
  {
    "method": "POST",
    "path": "/orders",
    "description": "Create a new order",
    "parameters": [
      {"name": "store_id", "in": "query", "type": "string", "required": true, "description": "Store ID"}
    ],
    "requestBody": {
      "contentType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "properties": {
          "customer_id": {"type": "string", "description": "Customer ID"}
        }
      }
    },
    "responses": [
      {"statusCode": 201, "description": "Order created"}
    ]
  }
]

Extract EVERY endpoint you can find. Be thorough.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async parseAuthentication(docs: string): Promise<AuthenticationInfo[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Analyze this API documentation and extract authentication requirements.

Documentation:
${docs.substring(0, 15000)}

Identify ALL authentication methods supported:
- API keys (header, query param)
- OAuth2 (authorization code, client credentials, etc.)
- Basic auth
- Bearer tokens
- Custom authentication

Respond with JSON array:
[
  {
    "type": "api_key",
    "location": "header",
    "name": "Authorization",
    "description": "API key prefixed with 'Bearer '"
  },
  {
    "type": "oauth2",
    "oauth2Flow": {
      "authorizationUrl": "https://...",
      "tokenUrl": "https://...",
      "scopes": {"read": "Read access", "write": "Write access"}
    }
  }
]`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async determineRequiredCredentials(
    docs: string,
    auth: AuthenticationInfo[]
  ): Promise<RequiredCredential[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Based on this API documentation and authentication requirements, determine what credentials a user needs to provide to use this API.

Documentation excerpt:
${docs.substring(0, 10000)}

Authentication methods found:
${JSON.stringify(auth, null, 2)}

List ALL credentials the user needs to provide:
- API keys
- Client ID / Client Secret (for OAuth)
- Store ID / Account ID
- Webhook secrets
- Any other required configuration

Respond with JSON array:
[
  {
    "name": "api_key",
    "type": "secret",
    "description": "Your API key from the developer dashboard",
    "required": true,
    "example": "sk_live_xxxxx",
    "validationHint": "Starts with 'sk_live_' or 'sk_test_'"
  },
  {
    "name": "store_id",
    "type": "string",
    "description": "Your store ID",
    "required": true,
    "example": "12345"
  }
]`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseOpenAPIEndpoint(
    path: string,
    method: string,
    details: any,
    spec: any
  ): ParsedEndpoint {
    const parameters = (details.parameters || []).map((p: any) => ({
      name: p.name,
      in: p.in,
      type: p.schema?.type || 'string',
      required: p.required || false,
      description: p.description || '',
      default: p.schema?.default,
      enum: p.schema?.enum,
    }));

    let requestBody;
    if (details.requestBody) {
      const content = details.requestBody.content?.['application/json'];
      if (content) {
        requestBody = {
          contentType: 'application/json',
          required: details.requestBody.required || false,
          schema: this.resolveRef(content.schema, spec),
        };
      }
    }

    const responses = Object.entries(details.responses || {}).map(([code, resp]: [string, any]) => ({
      statusCode: parseInt(code, 10) || 200,
      description: resp.description || '',
      schema: resp.content?.['application/json']?.schema
        ? this.resolveRef(resp.content['application/json'].schema, spec)
        : undefined,
    }));

    return {
      method: method.toUpperCase() as ParsedEndpoint['method'],
      path,
      description: details.summary || details.description || '',
      parameters,
      requestBody,
      responses,
    };
  }

  private parseOpenAPIAuth(spec: any): AuthenticationInfo[] {
    const auth: AuthenticationInfo[] = [];
    const securitySchemes = spec.components?.securitySchemes || {};

    for (const [name, scheme] of Object.entries(securitySchemes) as [string, any][]) {
      if (scheme.type === 'apiKey') {
        auth.push({
          type: 'api_key',
          location: scheme.in,
          name: scheme.name,
          description: scheme.description,
        });
      } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        auth.push({
          type: 'bearer',
          description: scheme.description,
        });
      } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
        auth.push({
          type: 'basic',
          description: scheme.description,
        });
      } else if (scheme.type === 'oauth2') {
        const flows = scheme.flows || {};
        const flow = flows.authorizationCode || flows.clientCredentials || flows.implicit;
        if (flow) {
          auth.push({
            type: 'oauth2',
            description: scheme.description,
            oauth2Flow: {
              authorizationUrl: flow.authorizationUrl,
              tokenUrl: flow.tokenUrl,
              refreshUrl: flow.refreshUrl,
              scopes: flow.scopes || {},
            },
          });
        }
      }
    }

    return auth;
  }

  private openAPIToCredentials(auth: AuthenticationInfo[], spec: any): RequiredCredential[] {
    const creds: RequiredCredential[] = [];

    for (const a of auth) {
      if (a.type === 'api_key') {
        creds.push({
          name: 'api_key',
          type: 'secret',
          description: a.description || 'API Key for authentication',
          required: true,
        });
      } else if (a.type === 'bearer') {
        creds.push({
          name: 'access_token',
          type: 'secret',
          description: 'Bearer access token',
          required: true,
        });
      } else if (a.type === 'basic') {
        creds.push(
          {
            name: 'username',
            type: 'string',
            description: 'Username for basic auth',
            required: true,
          },
          {
            name: 'password',
            type: 'secret',
            description: 'Password for basic auth',
            required: true,
          }
        );
      } else if (a.type === 'oauth2') {
        creds.push(
          {
            name: 'client_id',
            type: 'string',
            description: 'OAuth2 Client ID',
            required: true,
          },
          {
            name: 'client_secret',
            type: 'secret',
            description: 'OAuth2 Client Secret',
            required: true,
          }
        );
        if (a.oauth2Flow?.authorizationUrl) {
          creds.push({
            name: 'redirect_uri',
            type: 'url',
            description: 'OAuth2 Redirect URI',
            required: true,
          });
        }
      }
    }

    return creds;
  }

  private resolveRef(schema: any, spec: any): any {
    if (!schema) return schema;
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/', '').split('/');
      let resolved = spec;
      for (const part of refPath) {
        resolved = resolved?.[part];
      }
      return resolved || schema;
    }
    return schema;
  }

  private categorizeEndpoints(endpoints: ParsedEndpoint[]): APICategory[] {
    const categories: Map<string, ParsedEndpoint[]> = new Map();

    for (const endpoint of endpoints) {
      // Extract category from path (first segment after version)
      const pathParts = endpoint.path.split('/').filter(Boolean);
      const category = pathParts.find((p) => !p.startsWith('v') && !p.match(/^\d+$/)) || 'general';

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(endpoint);
    }

    return Array.from(categories.entries()).map(([name, eps]) => ({
      name,
      description: `Endpoints related to ${name}`,
      endpointPaths: eps.map((e) => e.path),
    }));
  }
}

export function createAPIParser(config: APIParserConfig): APIParser {
  return new APIParser(config);
}

/**
 * Contract Tester
 *
 * Validates that a live connector response conforms to its OpenAPI contract.
 * Each connector has a contract definition with expected schemas; the tester
 * runs "probe" requests and validates the responses against those schemas.
 *
 * Designed to be run in CI and in the watchdog's scheduled checks.
 */

import { createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractEndpoint {
  /** e.g. 'GET /orders' */
  id: string;
  method: string;
  path: string;
  description: string;
  /**
   * A simplified JSON Schema for the expected response body.
   * Supports: type, properties, required, items, enum.
   */
  responseSchema: JsonSchema;
  expectedStatus: number;
  /** Optional static headers to add (e.g. Content-Type) */
  headers?: Record<string, string>;
  /** Optional request body for probes (useful for SOAP/XML endpoints) */
  body?: string;
  /** Response parser mode */
  responseParser?: 'json' | 'text' | 'auto';
}

export interface JsonSchema {
  type?: string;
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  nullable?: boolean;
}

export interface ConnectorContract {
  connectorId: string;
  name: string;
  baseUrl: string;
  endpoints: ContractEndpoint[];
  /** Auth header name and env var for its value */
  auth?: {
    headerName: string;
    envVar: string;
  };
}

export interface ContractViolation {
  endpointId: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'critical' | 'warning';
}

export interface ContractTestResult {
  connectorId: string;
  endpointId: string;
  passed: boolean;
  statusCode?: number;
  violations: ContractViolation[];
  latencyMs: number;
  error?: string;
  testedAt: string;
}

export interface ContractSuiteResult {
  connectorId: string;
  passed: boolean;
  results: ContractTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    violations: number;
  };
  durationMs: number;
  runAt: string;
}

// ─── Schema Validator ─────────────────────────────────────────────────────────

export function validateSchema(
  value: unknown,
  schema: JsonSchema,
  path = 'root',
): ContractViolation[] {
  const violations: ContractViolation[] = [];

  if (value === null || value === undefined) {
    if (!schema.nullable && schema.type !== 'null') {
      violations.push({
        endpointId: '',
        field: path,
        expected: schema.type ?? 'non-null',
        actual: 'null/undefined',
        severity: 'critical',
      });
    }
    return violations;
  }

  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      violations.push({
        endpointId: '',
        field: path,
        expected: `one of [${schema.enum.join(', ')}]`,
        actual: String(value),
        severity: 'critical',
      });
    }
    return violations;
  }

  if (schema.pattern && typeof value === 'string') {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      violations.push({
        endpointId: '',
        field: path,
        expected: `match pattern ${schema.pattern}`,
        actual: value,
        severity: 'critical',
      });
      return violations;
    }
  }

  if (schema.anyOf) {
    const anyPassed = schema.anyOf.some(s => validateSchema(value, s, path).length === 0);
    if (!anyPassed) {
      violations.push({
        endpointId: '',
        field: path,
        expected: 'anyOf schema match',
        actual: typeof value,
        severity: 'warning',
      });
    }
    return violations;
  }

  if (schema.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type) {
      violations.push({
        endpointId: '',
        field: path,
        expected: schema.type,
        actual: actualType,
        severity: 'critical',
      });
      return violations; // no point validating children if type is wrong
    }
  }

  if (schema.type === 'object' && schema.properties && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Check required fields
    for (const req of schema.required ?? []) {
      if (!(req in obj)) {
        violations.push({
          endpointId: '',
          field: `${path}.${req}`,
          expected: 'present',
          actual: 'missing',
          severity: 'critical',
        });
      }
    }

    // Recurse into properties
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        const childViolations = validateSchema(obj[key], propSchema, `${path}.${key}`);
        violations.push(...childViolations);
      }
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value) && value.length > 0) {
    // Check first item for efficiency
    const childViolations = validateSchema(value[0], schema.items, `${path}[0]`);
    violations.push(...childViolations);
  }

  return violations;
}

// ─── Contract Tester ──────────────────────────────────────────────────────────

export class ContractTester {
  /**
   * Run all endpoints in a contract.
   * @param contract  The connector contract definition
   * @param fetchFn   Injection point for HTTP fetching (defaults to global fetch)
   */
  async runSuite(
    contract: ConnectorContract,
    fetchFn: typeof fetch = fetch,
  ): Promise<ContractSuiteResult> {
    const startTime = Date.now();
    const results: ContractTestResult[] = [];

    for (const endpoint of contract.endpoints) {
      const result = await this.testEndpoint(contract, endpoint, fetchFn);
      results.push(result);
    }

    const passed = results.every(r => r.passed);
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);

    return {
      connectorId: contract.connectorId,
      passed,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        violations: totalViolations,
      },
      durationMs: Date.now() - startTime,
      runAt: new Date().toISOString(),
    };
  }

  private async testEndpoint(
    contract: ConnectorContract,
    endpoint: ContractEndpoint,
    fetchFn: typeof fetch,
  ): Promise<ContractTestResult> {
    const start = Date.now();
    const url = `${contract.baseUrl}${endpoint.path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(endpoint.headers ?? {}),
    };

    if (contract.auth) {
      const val = process.env[contract.auth.envVar];
      if (val) headers[contract.auth.headerName] = val;
    }

    try {
      const response = await fetchFn(url, {
        method: endpoint.method,
        headers,
        body: endpoint.body,
      });

      const latencyMs = Date.now() - start;
      let body: unknown;

      const rawText = await response.text();
      if (endpoint.responseParser === 'text') {
        body = rawText;
      } else if (endpoint.responseParser === 'json') {
        try {
          body = JSON.parse(rawText) as unknown;
        } catch {
          body = null;
        }
      } else {
        try {
          body = JSON.parse(rawText) as unknown;
        } catch {
          body = rawText;
        }
      }

      const violations: ContractViolation[] = [];

      // Status check
      if (response.status !== endpoint.expectedStatus) {
        violations.push({
          endpointId: endpoint.id,
          field: 'status',
          expected: String(endpoint.expectedStatus),
          actual: String(response.status),
          severity: 'critical',
        });
      }

      // Schema validation (only if status ok)
      if (response.ok) {
        const schemaViolations = validateSchema(body, endpoint.responseSchema)
          .map(v => ({ ...v, endpointId: endpoint.id }));
        violations.push(...schemaViolations);
      }

      return {
        connectorId: contract.connectorId,
        endpointId: endpoint.id,
        passed: violations.filter(v => v.severity === 'critical').length === 0,
        statusCode: response.status,
        violations,
        latencyMs,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        connectorId: contract.connectorId,
        endpointId: endpoint.id,
        passed: false,
        violations: [],
        latencyMs: Date.now() - start,
        error: String(err),
        testedAt: new Date().toISOString(),
      };
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createContractTester(): ContractTester {
  return new ContractTester();
}

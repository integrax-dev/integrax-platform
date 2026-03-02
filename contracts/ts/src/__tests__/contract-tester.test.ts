import { describe, it, expect, vi } from 'vitest';
import { ContractTester, validateSchema } from '../contract-tester.js';
import type { ConnectorContract, JsonSchema } from '../contract-tester.js';

// ─── validateSchema tests ─────────────────────────────────────────────────────

describe('validateSchema', () => {
  it('passes for valid primitive types', () => {
    expect(validateSchema('hello', { type: 'string' })).toHaveLength(0);
    expect(validateSchema(42, { type: 'number' })).toHaveLength(0);
    expect(validateSchema(true, { type: 'boolean' })).toHaveLength(0);
  });

  it('fails for type mismatch', () => {
    const violations = validateSchema(42, { type: 'string' });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].expected).toBe('string');
    expect(violations[0].actual).toBe('number');
  });

  it('passes for arrays', () => {
    const schema: JsonSchema = { type: 'array' };
    expect(validateSchema([1, 2, 3], schema)).toHaveLength(0);
  });

  it('fails when expected array but got object', () => {
    const violations = validateSchema({}, { type: 'array' });
    expect(violations.length).toBeGreaterThan(0);
  });

  it('validates required object fields', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    };

    // missing 'name'
    const violations = validateSchema({ id: '123' }, schema);
    expect(violations.some(v => v.field.includes('name'))).toBe(true);
    expect(violations.some(v => v.expected === 'present')).toBe(true);
  });

  it('passes when all required fields are present', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    };

    expect(validateSchema({ id: '1', name: 'Test' }, schema)).toHaveLength(0);
  });

  it('validates nested object properties recursively', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['user'],
      properties: {
        user: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
            age: { type: 'number' },
          },
        },
      },
    };

    // email is wrong type
    const violations = validateSchema({ user: { email: 123, age: 30 } }, schema);
    expect(violations.some(v => v.field.includes('email'))).toBe(true);
  });

  it('validates array items using first element', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    };

    // id is number, expected string
    const violations = validateSchema([{ id: 123 }], schema);
    expect(violations.some(v => v.field.includes('[0]'))).toBe(true);
  });

  it('skips array item validation for empty arrays', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'object', required: ['id'] },
    };
    expect(validateSchema([], schema)).toHaveLength(0);
  });

  it('validates enum values', () => {
    const schema: JsonSchema = { enum: ['active', 'inactive'] };
    expect(validateSchema('active', schema)).toHaveLength(0);
    const violations = validateSchema('deleted', schema);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].expected).toContain('active');
  });

  it('allows null for nullable fields', () => {
    const schema: JsonSchema = { type: 'string', nullable: true };
    expect(validateSchema(null, schema)).toHaveLength(0);
  });

  it('fails for null on non-nullable field', () => {
    const schema: JsonSchema = { type: 'string' };
    const violations = validateSchema(null, schema);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('validates anyOf schemas', () => {
    const schema: JsonSchema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    expect(validateSchema('hello', schema)).toHaveLength(0);
    expect(validateSchema(42, schema)).toHaveLength(0);
    const violations = validateSchema([], schema);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('validates string pattern', () => {
    const schema: JsonSchema = { type: 'string', pattern: 'FEDummyResult|appserver' };
    expect(validateSchema('<FEDummyResult>ok</FEDummyResult>', schema)).toHaveLength(0);
    const violations = validateSchema('<soap>error</soap>', schema);
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ─── ContractTester tests ─────────────────────────────────────────────────────

describe('ContractTester', () => {
  const tester = new ContractTester();

  const SIMPLE_CONTRACT: ConnectorContract = {
    connectorId: 'test-connector',
    name: 'Test Connector',
    baseUrl: 'https://api.test.io',
    endpoints: [
      {
        id: 'GET /users',
        method: 'GET',
        path: '/users',
        description: 'List users',
        expectedStatus: 200,
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
      {
        id: 'GET /health',
        method: 'GET',
        path: '/health',
        description: 'Health check',
        expectedStatus: 200,
        responseSchema: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string' } },
        },
      },
    ],
  };

  function makeFetch(responses: Record<string, { status: number; body: unknown }>): typeof fetch {
    return async (url, _opts) => {
      const pathname = new URL(url as string).pathname;
      const mockData = responses[pathname];
      if (!mockData) {
        return {
          ok: false,
          status: 404,
          text: async () => JSON.stringify({}),
        } as Response;
      }
      const rawBody = typeof mockData.body === 'string'
        ? mockData.body
        : JSON.stringify(mockData.body);
      return {
        ok: mockData.status >= 200 && mockData.status < 300,
        status: mockData.status,
        text: async () => rawBody,
      } as Response;
    };
  }

  it('passes when all endpoints conform to contract', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 200, body: [{ id: '1', name: 'Alice' }] },
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);

    expect(result.passed).toBe(true);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.total).toBe(2);
  });

  it('fails when status code is wrong', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 404, body: { error: 'not found' } },
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);

    expect(result.passed).toBe(false);
    expect(result.summary.failed).toBe(1);

    const failedResult = result.results.find(r => r.endpointId === 'GET /users');
    expect(failedResult?.passed).toBe(false);
    expect(failedResult?.violations.some(v => v.field === 'status')).toBe(true);
  });

  it('fails when response body violates schema', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 200, body: [{ id: 123, name: 'Alice' }] }, // id should be string
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);

    const userResult = result.results.find(r => r.endpointId === 'GET /users');
    expect(userResult?.violations.length).toBeGreaterThan(0);
  });

  it('fails when required field is missing from response', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 200, body: [{ id: '1' }] }, // missing 'name'
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);
    const userResult = result.results.find(r => r.endpointId === 'GET /users');
    expect(userResult?.violations.some(v => v.field.includes('name'))).toBe(true);
  });

  it('handles network error gracefully', async () => {
    const fetchFn = async () => {
      throw new Error('Connection refused');
    };

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.results.every(r => r.error)).toBe(true);
  });

  it('records latency for each endpoint', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 200, body: [] },
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);
    for (const r of result.results) {
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('records testedAt timestamp for each result', async () => {
    const fetchFn = makeFetch({
      '/users': { status: 200, body: [] },
      '/health': { status: 200, body: { status: 'ok' } },
    });

    const result = await tester.runSuite(SIMPLE_CONTRACT, fetchFn);
    for (const r of result.results) {
      expect(r.testedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('includes auth header when auth config and env var are set', async () => {
    const contract: ConnectorContract = {
      ...SIMPLE_CONTRACT,
      auth: { headerName: 'X-API-Key', envVar: 'TEST_API_KEY' },
      endpoints: [SIMPLE_CONTRACT.endpoints[1]], // just /health
    };

    let capturedHeaders: Record<string, string> = {};
    const fetchFn = async (_url: RequestInfo | URL, opts?: RequestInit) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) } as Response;
    };

    process.env.TEST_API_KEY = 'my-secret';
    await tester.runSuite(contract, fetchFn);
    delete process.env.TEST_API_KEY;

    expect(capturedHeaders['X-API-Key']).toBe('my-secret');
  });

  it('result summary has correct runAt timestamp', async () => {
    const fetchFn = makeFetch({ '/health': { status: 200, body: { status: 'ok' } } });
    const contract = { ...SIMPLE_CONTRACT, endpoints: [SIMPLE_CONTRACT.endpoints[1]] };
    const result = await tester.runSuite(contract, fetchFn);
    expect(result.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sends endpoint body and validates text response with pattern', async () => {
    const soapContract: ConnectorContract = {
      connectorId: 'afip-wsfe',
      name: 'AFIP WSFE',
      baseUrl: 'https://wswhomo.afip.gov.ar',
      endpoints: [
        {
          id: 'SOAP FEDummy',
          method: 'POST',
          path: '/wsfev1/service.asmx',
          description: 'Health check',
          expectedStatus: 200,
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: 'http://ar.gov.afip.dif.FEV1/FEDummy',
          },
          body: '<Envelope><Body><FEDummy/></Body></Envelope>',
          responseParser: 'text',
          responseSchema: {
            type: 'string',
            pattern: 'FEDummyResult|appserver',
          },
        },
      ],
    };

    let capturedBody = '';
    const fetchFn = async (_url: RequestInfo | URL, opts?: RequestInit) => {
      capturedBody = String(opts?.body ?? '');
      return {
        ok: true,
        status: 200,
        text: async () => '<FEDummyResult><appserver>OK</appserver></FEDummyResult>',
      } as Response;
    };

    const result = await tester.runSuite(soapContract, fetchFn as typeof fetch);

    expect(capturedBody).toContain('FEDummy');
    expect(result.passed).toBe(true);
    expect(result.summary.failed).toBe(0);
  });
});

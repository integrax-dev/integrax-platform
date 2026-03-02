import { describe, it, expect } from 'vitest';
import { SchemaFingerprinter, canonicalise, sha256 } from '../schema-fingerprinter.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_SPEC = {
  info: { title: 'Test API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/payments': {
      get: {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, required: false },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  amount: { type: 'number' },
                  currency: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/payments/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', schema: { type: 'string' }, required: true }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ─── canonicalise ─────────────────────────────────────────────────────────────

describe('canonicalise', () => {
  it('sorts object keys recursively', () => {
    const a = canonicalise({ z: 1, a: 2 });
    const b = canonicalise({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it('returns empty string for null/undefined', () => {
    expect(canonicalise(null)).toBe('');
    expect(canonicalise(undefined)).toBe('');
  });

  it('preserves array order', () => {
    const a = canonicalise([1, 2, 3]);
    const b = canonicalise([3, 2, 1]);
    expect(a).not.toBe(b);
  });

  it('handles nested objects', () => {
    const a = canonicalise({ b: { z: 1, a: 2 }, a: 3 });
    const b = canonicalise({ a: 3, b: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('handles primitives', () => {
    expect(canonicalise(42)).toBe('42');
    expect(canonicalise('hello')).toBe('hello');
    expect(canonicalise(true)).toBe('true');
  });
});

// ─── sha256 ───────────────────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns 16-char hex string', () => {
    const result = sha256('test');
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('differs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

// ─── SchemaFingerprinter ──────────────────────────────────────────────────────

describe('SchemaFingerprinter', () => {
  const fp = new SchemaFingerprinter();

  it('produces a fingerprint with expected fields', () => {
    const result = fp.fingerprint('test-connector', BASE_SPEC);

    expect(result.connectorId).toBe('test-connector');
    expect(result.version).toBe('1.0.0');
    expect(typeof result.fingerprint).toBe('string');
    expect(result.fingerprint).toHaveLength(16);
    expect(result.endpoints).toHaveLength(3);
    expect(result.capturedAt).toBeTruthy();
  });

  it('is deterministic — same spec → same fingerprint', () => {
    const a = fp.fingerprint('c', BASE_SPEC);
    const b = fp.fingerprint('c', BASE_SPEC);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('is stable with reordered object keys', () => {
    const specA = {
      ...BASE_SPEC,
      paths: {
        '/payments': {
          get: BASE_SPEC.paths['/payments'].get,
          post: BASE_SPEC.paths['/payments'].post,
        },
        '/payments/{id}': BASE_SPEC.paths['/payments/{id}'],
      },
    };
    const specB = {
      ...BASE_SPEC,
      paths: {
        '/payments/{id}': BASE_SPEC.paths['/payments/{id}'],
        '/payments': {
          post: BASE_SPEC.paths['/payments'].post,
          get: BASE_SPEC.paths['/payments'].get,
        },
      },
    };

    const a = fp.fingerprint('c', specA);
    const b = fp.fingerprint('c', specB);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('detects added endpoint', () => {
    const modified = {
      ...BASE_SPEC,
      paths: {
        ...BASE_SPEC.paths,
        '/refunds': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '200': {} },
          },
        },
      },
    };

    const a = fp.fingerprint('c', BASE_SPEC);
    const b = fp.fingerprint('c', modified);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(b.endpoints.length).toBe(a.endpoints.length + 1);
  });

  it('detects changed response schema', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.paths['/payments'].get.responses['200'].content['application/json'].schema = {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string' } }, // added field
    };

    const a = fp.fingerprint('c', BASE_SPEC);
    const b = fp.fingerprint('c', modifiedSpec);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('detects auth scheme change', () => {
    const noAuthSpec = { ...BASE_SPEC, security: [], components: { securitySchemes: {} } };
    const a = fp.fingerprint('c', BASE_SPEC);
    const b = fp.fingerprint('c', noAuthSpec);
    expect(a.authHash).not.toBe(b.authHash);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('detects version change', () => {
    const v2Spec = { ...BASE_SPEC, info: { ...BASE_SPEC.info, version: '2.0.0' } };
    const a = fp.fingerprint('c', BASE_SPEC);
    const b = fp.fingerprint('c', v2Spec);
    expect(a.version).toBe('1.0.0');
    expect(b.version).toBe('2.0.0');
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('handles spec with no paths', () => {
    const emptySpec = { info: { title: 'Empty', version: '0.0.1' }, paths: {} };
    const result = fp.fingerprint('c', emptySpec);
    expect(result.endpoints).toHaveLength(0);
    expect(result.fingerprint).toBeTruthy();
  });

  it('handles spec with no servers', () => {
    const noServers = { ...BASE_SPEC, servers: undefined };
    const result = fp.fingerprint('c', noServers);
    expect(result).toBeTruthy();
  });

  it('fingerprintFromJson works correctly', () => {
    const json = JSON.stringify(BASE_SPEC);
    const result = fp.fingerprintFromJson('c', json);
    expect(result.fingerprint).toBe(fp.fingerprint('c', BASE_SPEC).fingerprint);
  });

  it('endpoints are sorted by method:path', () => {
    const result = fp.fingerprint('c', BASE_SPEC);
    const keys = result.endpoints.map(e => `${e.method}:${e.path}`);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});

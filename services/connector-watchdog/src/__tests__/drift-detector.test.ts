import { describe, it, expect } from 'vitest';
import { DriftDetector } from '../drift-detector.js';
import { SchemaFingerprinter } from '../schema-fingerprinter.js';

const fp = new SchemaFingerprinter();
const detector = new DriftDetector();

// ─── Base spec ────────────────────────────────────────────────────────────────

const BASE_SPEC = {
  info: { title: 'PayAPI', version: '1.0.0' },
  servers: [{ url: 'https://api.pay.io/v1' }],
  paths: {
    '/charges': {
      get: {
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          '200': {
            content: { 'application/json': { schema: { type: 'array' } } },
          },
        },
      },
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { amount: { type: 'number' }, currency: { type: 'string' } },
              },
            },
          },
        },
        responses: { '201': { content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    },
    '/charges/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', schema: { type: 'string' }, required: true }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } },
        delete: {
          responses: { '204': { description: 'Deleted' } },
        },
      },
    },
  },
  components: {
    securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
  },
  security: [{ apiKey: [] }],
};

function makeFingerprint(spec: object, connectorId = 'pay-api') {
  return fp.fingerprint(connectorId, spec as any);
}

// ─── Identical specs ──────────────────────────────────────────────────────────

describe('DriftDetector — no drift', () => {
  it('returns severity=none when fingerprints are identical', () => {
    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(BASE_SPEC);
    const report = detector.compare(baseline, current);

    expect(report.severity).toBe('none');
    expect(report.changes).toHaveLength(0);
    expect(report.status).toBe('resolved');
    expect(report.connectorId).toBe('pay-api');
  });

  it('report always has a valid id and detectedAt', () => {
    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(BASE_SPEC);
    const report = detector.compare(baseline, current);

    expect(report.id).toBeTruthy();
    expect(report.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── Endpoint removed ─────────────────────────────────────────────────────────

describe('DriftDetector — endpoint removed (critical)', () => {
  it('detects removed endpoint', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    delete modifiedSpec.paths['/charges/{id}'];

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.severity).toBe('critical');
    expect(report.changes.some(c => c.type === 'endpoint_removed')).toBe(true);
    expect(report.status).toBe('open');

    const removed = report.changes.find(c => c.type === 'endpoint_removed');
    expect(removed?.path).toContain('/charges/{id}');
    expect(removed?.severity).toBe('critical');
  });

  it('all removed endpoints are included in changes', () => {
    const emptySpec = { ...BASE_SPEC, paths: {} };
    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(emptySpec);
    const report = detector.compare(baseline, current);

    const removed = report.changes.filter(c => c.type === 'endpoint_removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(report.severity).toBe('critical');
  });
});

// ─── Endpoint added ───────────────────────────────────────────────────────────

describe('DriftDetector — endpoint added (minor)', () => {
  it('detects new endpoint as minor', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.paths['/refunds'] = {
      post: {
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': {} },
      },
    };

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.changes.some(c => c.type === 'endpoint_added')).toBe(true);
    const added = report.changes.find(c => c.type === 'endpoint_added');
    expect(added?.severity).toBe('minor');
    // Minor alone → severity=minor overall
    expect(report.severity).toBe('minor');
  });
});

// ─── Parameter changed ────────────────────────────────────────────────────────

describe('DriftDetector — param changed (major)', () => {
  it('detects changed query parameter', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.paths['/charges'].get.parameters = [
      { name: 'offset', in: 'query', schema: { type: 'integer' } }, // renamed
    ];

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.changes.some(c => c.type === 'param_changed')).toBe(true);
    expect(report.severity).toBe('major');
  });

  it('detects changed request body schema', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.paths['/charges'].post.requestBody.content['application/json'].schema = {
      type: 'object',
      required: ['amount', 'currency'],   // added required constraint
      properties: { amount: { type: 'number' }, currency: { type: 'string' } },
    };

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.changes.some(c => c.type === 'param_changed')).toBe(true);
    expect(report.severity).toBe('major');
  });
});

// ─── Response schema changed ──────────────────────────────────────────────────

describe('DriftDetector — response schema changed (major)', () => {
  it('detects changed response schema', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.paths['/charges'].get.responses['200'].content['application/json'].schema = {
      type: 'object', // changed from array to object
    };

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.changes.some(c => c.type === 'response_schema_changed')).toBe(true);
    expect(report.severity).toBe('major');
  });
});

// ─── Auth changed ─────────────────────────────────────────────────────────────

describe('DriftDetector — auth changed (critical)', () => {
  it('detects global auth scheme change', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    modifiedSpec.components.securitySchemes = {
      oauth2: { type: 'oauth2', flows: {} },
    };
    modifiedSpec.security = [{ oauth2: ['read:charges'] }];

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.severity).toBe('critical');
    expect(report.changes.some(c => c.type === 'auth_changed')).toBe(true);
  });
});

// ─── Version changed ──────────────────────────────────────────────────────────

describe('DriftDetector — version changed (minor)', () => {
  it('reports version change as minor', () => {
    const v2Spec = JSON.parse(JSON.stringify(BASE_SPEC));
    v2Spec.info.version = '2.0.0';
    // Keep same paths so only version differs

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(v2Spec);
    const report = detector.compare(baseline, current);

    const versionChange = report.changes.find(c => c.type === 'version_changed');
    expect(versionChange).toBeTruthy();
    expect(versionChange?.severity).toBe('minor');
    expect(report.severity).toBe('minor');
  });
});

// ─── Severity escalation ──────────────────────────────────────────────────────

describe('DriftDetector — severity escalation', () => {
  it('escalates to highest severity when multiple change types exist', () => {
    const modifiedSpec = JSON.parse(JSON.stringify(BASE_SPEC));
    // Add endpoint (minor) AND remove endpoint (critical)
    modifiedSpec.paths['/new-endpoint'] = { get: { responses: { '200': {} } } };
    delete modifiedSpec.paths['/charges/{id}'];

    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(modifiedSpec);
    const report = detector.compare(baseline, current);

    expect(report.severity).toBe('critical'); // highest wins
    expect(report.changes.some(c => c.type === 'endpoint_added')).toBe(true);
    expect(report.changes.some(c => c.type === 'endpoint_removed')).toBe(true);
  });
});

// ─── Report structure ─────────────────────────────────────────────────────────

describe('DriftDetector — report structure', () => {
  it('report includes both baseline and current fingerprints', () => {
    const baseline = makeFingerprint(BASE_SPEC);
    const modified = JSON.parse(JSON.stringify(BASE_SPEC));
    modified.info.version = '2.0.0';
    const current = makeFingerprint(modified);

    const report = detector.compare(baseline, current);
    expect(report.baseline.version).toBe('1.0.0');
    expect(report.current.version).toBe('2.0.0');
  });

  it('each change has type, severity, and description', () => {
    const emptySpec = { ...BASE_SPEC, paths: {} };
    const baseline = makeFingerprint(BASE_SPEC);
    const current = makeFingerprint(emptySpec);
    const report = detector.compare(baseline, current);

    for (const change of report.changes) {
      expect(change.type).toBeTruthy();
      expect(change.severity).toBeTruthy();
      expect(change.description).toBeTruthy();
    }
  });
});

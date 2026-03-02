import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DriftAnalyzer } from '../drift-analyzer.js';
import type { EvidencePack, DriftReport, SchemaFingerprint } from '../../connector-watchdog/src/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFp(): SchemaFingerprint {
  return {
    connectorId: 'test',
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    fingerprint: 'abc',
    endpoints: [],
    authHash: 'a',
    infoHash: 'b',
  };
}

function makeReport(severity: DriftReport['severity'] = 'major'): DriftReport {
  return {
    id: 'r1',
    connectorId: 'mercadopago',
    detectedAt: new Date().toISOString(),
    severity,
    baseline: makeFp(),
    current: makeFp(),
    changes: [
      { type: 'endpoint_removed', severity: 'critical', path: 'GET:/payments', description: 'Endpoint removed' },
    ],
    status: 'open',
  };
}

function makeEvidencePack(): EvidencePack {
  return {
    id: 'pack-1',
    connectorId: 'mercadopago',
    createdAt: new Date().toISOString(),
    drift: makeReport(),
    httpSamples: [
      {
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.mercadopago.com/v1/payments',
        requestHeaders: {},
        responseStatus: 404,
        responseHeaders: {},
        responseBody: { error: 'not found' },
        latencyMs: 150,
      },
    ],
    connectorVersion: '1.0.0',
    environment: 'production',
    tags: ['connector:mercadopago', 'severity:major'],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DriftAnalyzer', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENABLE_LLM_DRIFT_ANALYSIS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_LLM_DRIFT_ANALYSIS;
    } else {
      process.env.ENABLE_LLM_DRIFT_ANALYSIS = originalEnv;
    }
  });

  describe('when LLM is disabled (default)', () => {
    it('analyze() returns null without calling LLM', async () => {
      delete process.env.ENABLE_LLM_DRIFT_ANALYSIS;

      const analyzer = new DriftAnalyzer({
        anthropicApiKey: 'test-key',
      });

      const result = await analyzer.analyze(makeEvidencePack());
      expect(result).toBeNull();
    });

    it('summariseDriftReport() returns null when disabled', async () => {
      delete process.env.ENABLE_LLM_DRIFT_ANALYSIS;

      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'test-key' });
      const result = await analyzer.summariseDriftReport(makeReport());
      expect(result).toBeNull();
    });
  });

  describe('response parsing', () => {
    it('parses valid JSON response correctly', async () => {
      // Access private method via cast
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;

      const jsonResponse = JSON.stringify({
        summary: 'The payments endpoint was removed',
        rootCauseHypotheses: ['API versioning change', 'Endpoint deprecated'],
        recommendedActions: ['Update connector to v2', 'Check API changelog'],
        estimatedImpact: 'high',
        confidenceScore: 0.9,
      });

      const parsed = analyzer.parseResponse(jsonResponse);

      expect(parsed).not.toBeNull();
      expect(parsed.summary).toBe('The payments endpoint was removed');
      expect(parsed.rootCauseHypotheses).toHaveLength(2);
      expect(parsed.recommendedActions).toHaveLength(2);
      expect(parsed.estimatedImpact).toBe('high');
      expect(parsed.confidenceScore).toBe(0.9);
    });

    it('extracts JSON from markdown code block', async () => {
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;

      const markdownResponse = `Here's my analysis:

\`\`\`json
{
  "summary": "Breaking change detected",
  "rootCauseHypotheses": ["Version bump"],
  "recommendedActions": ["Update SDK"],
  "estimatedImpact": "medium",
  "confidenceScore": 0.7
}
\`\`\``;

      const parsed = analyzer.parseResponse(markdownResponse);
      expect(parsed).not.toBeNull();
      expect(parsed.summary).toBe('Breaking change detected');
    });

    it('returns null for unparseable response', async () => {
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;
      const parsed = analyzer.parseResponse('This is not JSON at all');
      expect(parsed).toBeNull();
    });

    it('clamps confidenceScore to [0, 1]', async () => {
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;

      const tooHigh = analyzer.parseResponse(JSON.stringify({
        summary: 'test', rootCauseHypotheses: [], recommendedActions: [],
        estimatedImpact: 'low', confidenceScore: 2.5,
      }));
      expect(tooHigh.confidenceScore).toBe(1);

      const tooLow = analyzer.parseResponse(JSON.stringify({
        summary: 'test', rootCauseHypotheses: [], recommendedActions: [],
        estimatedImpact: 'low', confidenceScore: -0.5,
      }));
      expect(tooLow.confidenceScore).toBe(0);
    });

    it('normalises unknown estimatedImpact to medium', async () => {
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;
      const parsed = analyzer.parseResponse(JSON.stringify({
        summary: 'test', rootCauseHypotheses: [], recommendedActions: [],
        estimatedImpact: 'very-high', confidenceScore: 0.5,
      }));
      expect(parsed.estimatedImpact).toBe('medium');
    });

    it('handles missing fields gracefully', async () => {
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' }) as any;
      const parsed = analyzer.parseResponse(JSON.stringify({
        summary: 'minimal response',
      }));

      expect(parsed).not.toBeNull();
      expect(parsed.rootCauseHypotheses).toEqual([]);
      expect(parsed.recommendedActions).toEqual([]);
      expect(parsed.estimatedImpact).toBe('medium');
      expect(parsed.confidenceScore).toBe(0.5);
    });
  });

  describe('analysis result guarantees', () => {
    it('isExecutable is always false', async () => {
      process.env.ENABLE_LLM_DRIFT_ANALYSIS = 'true';

      const mockResponse = JSON.stringify({
        summary: 'Test summary',
        rootCauseHypotheses: ['Hypothesis A'],
        recommendedActions: ['Action 1'],
        estimatedImpact: 'low',
        confidenceScore: 0.8,
      });

      // Mock the callClaude method
      const analyzer = new DriftAnalyzer({ anthropicApiKey: 'key' });
      (analyzer as any).callClaude = vi.fn().mockResolvedValue(mockResponse);

      const result = await analyzer.analyze(makeEvidencePack());

      // Even if LLM is enabled, isExecutable must always be false
      expect(result?.isExecutable).toBe(false);
    });
  });
});

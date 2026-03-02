import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideRemediation,
  getByPath,
  parseProbeArray,
  proposeRemediation,
  runProbe,
  runProbesWithConcurrency,
  type ProbeResult,
  type ProbeRunnerMap,
} from '../verify-integration-surface.ts';

describe('verify-integration-surface helpers', () => {
  it('parseProbeArray returns empty for non-array payload', () => {
    assert.deepEqual(parseProbeArray('{"type":"graphql"}'), []);
  });

  it('getByPath resolves nested fields and returns undefined for missing paths', () => {
    const payload = { connector: { state: 'RUNNING', task: { id: 1 } } };
    assert.equal(getByPath(payload, 'connector.state'), 'RUNNING');
    assert.equal(getByPath(payload, 'connector.task.id'), 1);
    assert.equal(getByPath(payload, 'connector.task.missing'), undefined);
  });

  it('proposeRemediation returns generic actionable hints for failed http-contract', () => {
    const result: ProbeResult = {
      id: 'http:afip-wsfe',
      protocol: 'http-contract',
      status: 'failed_real',
      checkedAt: new Date().toISOString(),
      metadata: {
        connectorId: 'afip-wsfe',
        statusCode: 401,
        endpointId: 'POST /wsfev1/service.asmx',
      },
    };

    const suggestions = proposeRemediation(result);
    assert.equal(suggestions.some((value) => value.includes('credenciales')), true);
    assert.equal(suggestions.some((value) => value.includes('endpoint')), true);
  });

  it('decideRemediation exposes signals and matched rules for explainable decisions', () => {
    const result: ProbeResult = {
      id: 'http:test',
      protocol: 'http-contract',
      status: 'failed_real',
      checkedAt: new Date().toISOString(),
      details: 'fetch failed with timeout and HTTP 503',
      metadata: {
        statusCode: 503,
        endpointId: 'GET /health',
      },
    };

    const decision = decideRemediation(result);

    assert.equal(decision.signals.includes('network_error'), true);
    assert.equal(decision.signals.includes('remote_5xx'), true);
    assert.equal(decision.matchedRuleIds.includes('http-contract-review'), true);
    assert.equal(decision.recommendations.some((value) => value.includes('GET /health')), true);
  });

  it('decideRemediation uses structured source when failureCode is available', () => {
    const result: ProbeResult = {
      id: 'cdc:test',
      protocol: 'cdc',
      status: 'failed_real',
      checkedAt: new Date().toISOString(),
      metadata: {
        failureCode: 'NETWORK_ERROR',
      },
    };

    const decision = decideRemediation(result);

    assert.equal(decision.source, 'structured');
    assert.equal(decision.signals.includes('network_error'), true);
    assert.equal(decision.matchedRuleIds.includes('network-error'), true);
  });

  it('runProbe dispatches using injected runner map', async () => {
    let grpcCalls = 0;

    const map: ProbeRunnerMap = {
      'http-contract': async (probe) => ({
        id: probe.id,
        protocol: 'http-contract',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      graphql: async (probe) => ({
        id: probe.id,
        protocol: 'graphql',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      grpc: async (probe) => {
        grpcCalls += 1;
        return {
          id: probe.id,
          protocol: 'grpc',
          status: 'verified_real',
          checkedAt: new Date().toISOString(),
        };
      },
      sql: async (probe) => ({
        id: probe.id,
        protocol: 'sql',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      kafka: async (probe) => ({
        id: probe.id,
        protocol: 'kafka',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      cdc: async (probe) => ({
        id: probe.id,
        protocol: 'cdc',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      webhook: async (probe) => ({
        id: probe.id,
        protocol: 'webhook',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
      redis: async (probe) => ({
        id: probe.id,
        protocol: 'redis',
        status: 'verified_real',
        checkedAt: new Date().toISOString(),
      }),
    };

    const result = await runProbe(
      {
        type: 'grpc',
        id: 'grpc:test',
        target: 'localhost:50051',
        method: 'Health.Check',
      },
      map,
    );

    assert.equal(result.protocol, 'grpc');
    assert.equal(grpcCalls, 1);
  });

  it('runProbesWithConcurrency preserves order and runs with bounded parallelism', async () => {
    const seen: string[] = [];
    const delayed = async (id: string, protocol: ProbeResult['protocol']) => {
      await new Promise((resolve) => setTimeout(resolve, id === '2' ? 15 : 5));
      seen.push(id);
      return {
        id,
        protocol,
        status: 'verified_real' as const,
        checkedAt: new Date().toISOString(),
      };
    };

    const map: ProbeRunnerMap = {
      'http-contract': async (probe) => delayed(probe.id, 'http-contract'),
      graphql: async (probe) => delayed(probe.id, 'graphql'),
      grpc: async (probe) => delayed(probe.id, 'grpc'),
      sql: async (probe) => delayed(probe.id, 'sql'),
      kafka: async (probe) => delayed(probe.id, 'kafka'),
      cdc: async (probe) => delayed(probe.id, 'cdc'),
      webhook: async (probe) => delayed(probe.id, 'webhook'),
      redis: async (probe) => delayed(probe.id, 'redis'),
    };

    const results = await runProbesWithConcurrency([
      { type: 'grpc', id: '1', target: 't', method: 'm' },
      { type: 'graphql', id: '2', url: 'https://example.com/gql' },
      { type: 'redis', id: '3' },
    ], map, 2);

    assert.deepEqual(results.map((result) => result.id), ['1', '2', '3']);
    assert.equal(seen.length, 3);
  });
});

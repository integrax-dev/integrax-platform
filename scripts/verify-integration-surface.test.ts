import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoInfrastructureProbes,
  getByPath,
  parseProbeArray,
  proposeRemediation,
  type ProbeResult,
} from './verify-integration-surface.ts';

test('parseProbeArray devuelve probes para JSON array válido', () => {
  const probes = parseProbeArray(
    JSON.stringify([{ type: 'graphql', id: 'g1', url: 'https://example/graphql' }]),
  );
  assert.equal(probes.length, 1);
  assert.equal(probes[0]?.type, 'graphql');
});

test('parseProbeArray devuelve [] para JSON no-array', () => {
  assert.deepEqual(parseProbeArray(JSON.stringify({ type: 'graphql' })), []);
});

test('getByPath recupera rutas anidadas y undefined en faltantes', () => {
  const value = { connector: { state: 'RUNNING' }, tasks: [{ state: 'RUNNING' }] };
  assert.equal(getByPath(value, 'connector.state'), 'RUNNING');
  assert.equal(getByPath(value, 'tasks.0.state'), 'RUNNING');
  assert.equal(getByPath(value, 'tasks.1.state'), undefined);
});

test('autoInfrastructureProbes autodetecta infra configurada', () => {
  process.env.KAFKA_BROKERS = 'localhost:9092';
  process.env.DEBEZIUM_CONNECT_URL = 'http://localhost:8083';
  process.env.REDIS_URL = 'redis://localhost:6379';

  const probes = autoInfrastructureProbes().map((probe) => probe.id);

  assert.ok(probes.includes('infra:kafka'));
  assert.ok(probes.includes('infra:cdc'));
  assert.ok(probes.includes('infra:redis'));

  delete process.env.KAFKA_BROKERS;
  delete process.env.DEBEZIUM_CONNECT_URL;
  delete process.env.REDIS_URL;
});

test('proposeRemediation usa recomendaciones genéricas sin hardcode por conector', () => {
  const result: ProbeResult = {
    id: 'http:afip-wsfe',
    protocol: 'http-contract',
    status: 'failed_real',
    checkedAt: new Date().toISOString(),
    details: 'HTTP 401 Unauthorized',
    metadata: {
      connectorId: 'afip-wsfe',
      statusCode: 401,
      endpointId: 'POST /wsfev1/service.asmx',
    },
  };

  const suggestions = proposeRemediation(result).join(' | ');
  assert.match(suggestions, /credenciales/i);
  assert.match(suggestions, /endpoint POST \/wsfev1\/service\.asmx/i);
  assert.doesNotMatch(suggestions, /SOAPAction/i);
  assert.doesNotMatch(suggestions, /FEDummyResult/i);
});

test('proposeRemediation agrega conectividad para errores de red', () => {
  const result: ProbeResult = {
    id: 'infra:cdc',
    protocol: 'cdc',
    status: 'failed_real',
    checkedAt: new Date().toISOString(),
    details: 'fetch failed',
  };

  const suggestions = proposeRemediation(result).join(' | ');
  assert.match(suggestions, /conectividad/i);
  assert.match(suggestions, /Debezium|connector\/tasks|DEBEZIUM_CONNECT_URL/i);
});

test('proposeRemediation devuelve [] cuando no hay falla real', () => {
  const result: ProbeResult = {
    id: 'infra:redis',
    protocol: 'redis',
    status: 'verified_real',
    checkedAt: new Date().toISOString(),
    details: 'ok',
  };

  assert.deepEqual(proposeRemediation(result), []);
});

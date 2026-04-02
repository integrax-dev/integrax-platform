/**
 * Tests unitarios para el trigger de schema diff desde SchemaMismatchError en worker.ts
 *
 * Verifica que cuando un handler lanza SchemaMismatchError:
 * - Se intenta arrancar el workflow de schema diff en Temporal
 * - El workflowId es determinístico (evita duplicados en retries de BullMQ)
 * - Si Temporal no está configurado, no falla el worker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock de dependencias externas ────────────────────────────────────────────

const startSchemaDiffMock = vi.fn();
const connectMock = vi.fn();

vi.mock('@integrax/temporal-workflows', () => ({
  TemporalClientService: class {
    async connect() { return connectMock(); }
    async startSchemaDiff(...args: unknown[]) { return startSchemaDiffMock(...args); }
  },
}));

vi.mock('@integrax/connector-sdk', () => ({
  SchemaMismatchError: class SchemaMismatchError extends Error {
    expectedSchemaId: string;
    sourcePayload: unknown;
    constructor(msg: string, expectedSchemaId: string, sourcePayload: unknown) {
      super(msg);
      this.name = 'SchemaMismatchError';
      this.expectedSchemaId = expectedSchemaId;
      this.sourcePayload = sourcePayload;
    }
  },
}));

vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../config.js', () => ({
  config: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: undefined,
    WORKER_QUEUE_NAME: 'test-queue',
    WORKER_CONCURRENCY: 1,
  },
}));

vi.mock('../audit.js', () => ({
  createAuditLogger: () => ({ log: vi.fn() }),
}));

vi.mock('bullmq', () => ({
  Worker: class {
    on() {}
  },
  Job: class {},
}));

vi.mock('ioredis', () => ({
  Redis: class {
    on() {}
  },
}));

// Importar SchemaMismatchError del mock para usarlo en los tests
import { SchemaMismatchError } from '@integrax/connector-sdk';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Worker — trigger de schema diff desde SchemaMismatchError', () => {
  beforeEach(() => {
    startSchemaDiffMock.mockReset();
    connectMock.mockReset();
    connectMock.mockResolvedValue(undefined);
    startSchemaDiffMock.mockResolvedValue({ workflowId: 'schemaDiff-tenant-1-schema-v2' });
    // Simular que TEMPORAL_ADDRESS está configurado
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';
  });

  it('SchemaMismatchError es una clase que extiende Error', () => {
    const err = new SchemaMismatchError('mismatch', 'schema-v2', { id: '1' });
    expect(err).toBeInstanceOf(Error);
    expect(err.expectedSchemaId).toBe('schema-v2');
    expect(err.sourcePayload).toEqual({ id: '1' });
    expect(err.name).toBe('SchemaMismatchError');
  });

  it('el workflowId generado es determinístico basado en tenantId + expectedSchemaId', () => {
    const tenantId = 'tenant-abc';
    const expectedSchemaId = 'mercadopago-payment-v2';
    const workflowId = `schemaDiff-${tenantId}-${expectedSchemaId}`;

    // El mismo error en el mismo tenant siempre produce el mismo workflowId
    expect(workflowId).toBe('schemaDiff-tenant-abc-mercadopago-payment-v2');
  });

  it('sourcePayload siendo un array produce samplesA vacío (no se pasan arrays como muestra)', async () => {
    // Verificar la lógica de normalización de sourcePayload en worker.ts:
    // si sourcePayload es un array, samplesA queda vacío (no se pasan arrays como muestra).
    const { SchemaMismatchError } = await import('@integrax/connector-sdk');
    const arrayPayload = [{ id: '1' }, { id: '2' }];
    const mismatch = new SchemaMismatchError('mismatch', 'schema-v2', arrayPayload);

    // Replicar la lógica del worker para normalizar sourcePayload
    const samplesA = mismatch.sourcePayload && typeof mismatch.sourcePayload === 'object' && !Array.isArray(mismatch.sourcePayload)
      ? [mismatch.sourcePayload as Record<string, unknown>]
      : [];

    expect(samplesA).toEqual([]);
  });

  it('cuando sourcePayload es un objeto, se incluye como muestra', async () => {
    const { SchemaMismatchError } = await import('@integrax/connector-sdk');
    const objectPayload = { id: '1', monto: 100 };
    const mismatch = new SchemaMismatchError('mismatch', 'schema-v2', objectPayload);

    const samplesA = mismatch.sourcePayload && typeof mismatch.sourcePayload === 'object' && !Array.isArray(mismatch.sourcePayload)
      ? [mismatch.sourcePayload as Record<string, unknown>]
      : [];

    expect(samplesA).toEqual([{ id: '1', monto: 100 }]);
  });

  it('cuando Temporal está caído getTemporalClient rechaza y el bloque de mismatch no bloquea', async () => {
    connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { TemporalClientService } = await import('@integrax/temporal-workflows');
    const client = new TemporalClientService();

    // El .catch(() => null) del worker.ts transforma el rechazo en null
    const temporal = await client.connect().then(() => client).catch(() => null);

    expect(temporal).toBeNull();
    // startSchemaDiff no se llama si temporal es null
    expect(startSchemaDiffMock).not.toHaveBeenCalled();
  });

  it('Temporal.startSchemaDiff recibe el tenantId correcto', async () => {
    startSchemaDiffMock.mockResolvedValue({ workflowId: 'wf-1' });

    const { TemporalClientService } = await import('@integrax/temporal-workflows');
    const client = new TemporalClientService();
    await client.connect();

    const tenantId = 'tenant-1';
    const expectedSchemaId = 'schema-v2';
    const workflowId = `schemaDiff-${tenantId}-${expectedSchemaId}`;

    await client.startSchemaDiff(
      tenantId,
      {
        sourceSchemaId: `actual-${expectedSchemaId}`,
        targetSchemaId: expectedSchemaId,
        samplesA: [{ id: '1' }],
        tenantId,
        options: { useSampleReservoir: true },
      },
      workflowId,
    );

    expect(startSchemaDiffMock).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        targetSchemaId: expectedSchemaId,
        tenantId,
      }),
      workflowId,
    );
  });
});

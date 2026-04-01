import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { createLogger } from './logger.js';
import { processOrderPaid } from './handlers/order-paid.js';
import { processInvoiceIssued } from './handlers/invoice-issued.js';
import type { AuditLogger } from './audit.js';
import { SchemaMismatchError } from '@integrax/connector-sdk';
import { TemporalClientService } from '@integrax/temporal-workflows';

const logger = createLogger('worker');

// Cliente Temporal lazy — solo se inicializa si TEMPORAL_ADDRESS está configurado.
// Lock basado en Promise: los jobs concurrentes comparten la misma Promise de init
// en vez de crear múltiples clientes (lo que filtraría conexiones).
let _temporalClientPromise: Promise<TemporalClientService | null> | null = null;

function getTemporalClient(): Promise<TemporalClientService | null> {
  if (!process.env.TEMPORAL_ADDRESS) return Promise.resolve(null);
  if (!_temporalClientPromise) {
    _temporalClientPromise = (async () => {
      const c = new TemporalClientService();
      await c.connect();
      return c;
    })().catch(err => {
      _temporalClientPromise = null; // permite reintentar si Temporal estaba caído
      throw err;
    });
  }
  return _temporalClientPromise;
}

export interface TaskPayload {
  eventType: string;
  eventId: string;
  correlationId: string;
  tenantId: string;
  occurredAt: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export type TaskResult = {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

const handlers: Record<string, (job: Job<TaskPayload>, audit: AuditLogger) => Promise<TaskResult>> = {
  'business.order.paid': processOrderPaid,
  'business.invoice.issued': processInvoiceIssued,
};

export async function createWorker(auditLogger: AuditLogger): Promise<Worker> {
  const connection = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<TaskPayload, TaskResult>(
    config.WORKER_QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();
      const { eventType, eventId, correlationId, tenantId } = job.data;

      logger.info({
        eventType,
        eventId,
        correlationId,
        tenantId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      }, 'Processing task');

      const handler = handlers[eventType];

      if (!handler) {
        logger.warn({ eventType }, 'No handler registered for event type');

        await auditLogger.log({
          tenantId,
          correlationId,
          action: 'task.skipped',
          resourceType: 'event',
          resourceId: eventId,
          result: 'failure',
          details: { reason: 'no_handler', eventType },
        });

        return {
          success: false,
          error: {
            code: 'NO_HANDLER',
            message: `No handler for event type: ${eventType}`,
            retryable: false,
          },
        };
      }

      try {
        const result = await handler(job, auditLogger);

        const durationMs = Date.now() - startTime;

        await auditLogger.log({
          tenantId,
          correlationId,
          action: `task.${eventType}`,
          resourceType: 'event',
          resourceId: eventId,
          result: result.success ? 'success' : 'failure',
          details: {
            durationMs,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            ...(result.error && { error: result.error }),
          },
        });

        logger.info({
          eventType,
          eventId,
          correlationId,
          success: result.success,
          durationMs,
        }, 'Task completed');

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error({
          eventType,
          eventId,
          correlationId,
          error: errorMessage,
          durationMs,
        }, 'Task failed');

        // Si un conector detectó un schema mismatch, disparar un workflow de schema diff
        // en Temporal para que la plataforma detecte y aprenda el delta automáticamente.
        if (error instanceof SchemaMismatchError) {
          const mismatch: SchemaMismatchError = error;
          const temporal = await getTemporalClient().catch(() => null);
          if (temporal) {
            // ID determinístico: Temporal rechaza duplicados con WorkflowExecutionAlreadyStarted,
            // así que un retry de BullMQ del mismo SchemaMismatchError no crea un segundo workflow.
            const workflowId = `schemaDiff-${tenantId}-${mismatch.expectedSchemaId}`;
            await temporal.startSchemaDiff(
              tenantId,
              {
                sourceSchemaId: `actual-${mismatch.expectedSchemaId}`,
                targetSchemaId: mismatch.expectedSchemaId,
                samplesA: mismatch.sourcePayload && typeof mismatch.sourcePayload === 'object' && !Array.isArray(mismatch.sourcePayload)
                  ? [mismatch.sourcePayload as Record<string, unknown>]
                  : [],
                tenantId,
                options: { useSampleReservoir: true },
              },
              workflowId,
            ).catch((diffErr: unknown) => {
              logger.warn({ diffErr: String(diffErr), workflowId }, 'Failed to start schema diff workflow');
            });
            logger.info({ workflowId, expectedSchemaId: mismatch.expectedSchemaId }, 'Schema diff triggered from SchemaMismatchError');
          } else {
            logger.warn({ expectedSchemaId: mismatch.expectedSchemaId }, 'TEMPORAL_ADDRESS not set — schema diff not triggered');
          }
        }

        await auditLogger.log({
          tenantId,
          correlationId,
          action: `task.${eventType}`,
          resourceType: 'event',
          resourceId: eventId,
          result: 'failure',
          details: {
            durationMs,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            error: errorMessage,
          },
        });

        throw error;
      }
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Worker error');
  });

  return worker;
}

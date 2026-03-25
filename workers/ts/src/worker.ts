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

// Lazy Temporal client — only initialized when TEMPORAL_ADDRESS is set.
// Promise-based lock: concurrent jobs share the same init Promise instead of
// creating multiple clients (which would leak connections).
let _temporalClientPromise: Promise<TemporalClientService | null> | null = null;

function getTemporalClient(): Promise<TemporalClientService | null> {
  if (!process.env.TEMPORAL_ADDRESS) return Promise.resolve(null);
  if (!_temporalClientPromise) {
    _temporalClientPromise = (async () => {
      const c = new TemporalClientService();
      await c.connect();
      return c;
    })();
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

        // If a connector detected a schema mismatch, trigger an async schema diff
        // workflow in Temporal so the platform can auto-detect and learn the delta.
        if (error instanceof SchemaMismatchError) {
          const mismatch: SchemaMismatchError = error;
          const temporal = await getTemporalClient().catch(() => null);
          if (temporal) {
            // Deterministic ID: Temporal rejects duplicates with WorkflowExecutionAlreadyStarted,
            // so a BullMQ retry of the same SchemaMismatchError won't spawn a second workflow.
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
            ).catch(diffErr => {
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

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { createLogger } from './logger.js';
import { processOrderPaid } from './handlers/order-paid.js';
import { processInvoiceIssued } from './handlers/invoice-issued.js';
import type { AuditLogger } from './audit.js';

const logger = createLogger('worker');

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

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

const TEST_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const TEST_QUEUE_NAME = 'integrax-test-queue';

interface TestTaskPayload {
  eventId: string;
  eventType: string;
  tenantId: string;
  correlationId: string;
  data: Record<string, unknown>;
}

describe('BullMQ Queue Integration', () => {
  let redis: Redis;
  let queue: Queue<TestTaskPayload>;
  let worker: Worker<TestTaskPayload> | null = null;

  beforeAll(async () => {
    redis = new Redis({
      ...TEST_CONFIG,
      maxRetriesPerRequest: null,
    });

    queue = new Queue<TestTaskPayload>(TEST_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 100,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  });

  afterAll(async () => {
    if (worker) {
      await worker.close();
    }
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean queue before each test
    await queue.obliterate({ force: true });
  });

  it('should connect to Redis', async () => {
    const pong = await redis.ping();
    expect(pong).toBe('PONG');
  });

  it('should enqueue a job', async () => {
    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: {
        orderId: 'ORD-12345',
        amount: 15000,
        currency: 'ARS',
      },
    };

    const job = await queue.add('order.paid', payload);

    expect(job.id).toBeDefined();
    expect(job.name).toBe('order.paid');
    expect(job.data.eventId).toBe(payload.eventId);
  });

  it('should process a job with worker', async () => {
    const processedJobs: TestTaskPayload[] = [];

    worker = new Worker<TestTaskPayload>(
      TEST_QUEUE_NAME,
      async (job: Job<TestTaskPayload>) => {
        processedJobs.push(job.data);
        return { success: true, processedAt: new Date().toISOString() };
      },
      { connection: redis }
    );

    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: { orderId: 'ORD-001' },
    };

    await queue.add('order.paid', payload);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(processedJobs).toHaveLength(1);
    expect(processedJobs[0].eventId).toBe(payload.eventId);

    await worker.close();
    worker = null;
  });

  it('should handle job with custom jobId for idempotency', async () => {
    const customJobId = 'unique-order-ORD-123-PAY-456';
    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: { orderId: 'ORD-123' },
    };

    // Add first job
    const job1 = await queue.add('order.paid', payload, { jobId: customJobId });
    expect(job1.id).toBe(customJobId);

    // Try to add duplicate - should return same job
    const job2 = await queue.add('order.paid', payload, { jobId: customJobId });
    expect(job2.id).toBe(customJobId);

    // Should only have one job
    const waitingCount = await queue.getWaitingCount();
    expect(waitingCount).toBe(1);
  });

  it('should support delayed jobs', async () => {
    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.invoice.issued',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: { invoiceId: 'INV-001' },
    };

    const job = await queue.add('invoice.issued', payload, { delay: 1000 });

    expect(job.opts.delay).toBe(1000);

    const delayedCount = await queue.getDelayedCount();
    expect(delayedCount).toBe(1);
  });

  it('should support job priority', async () => {
    const lowPriorityPayload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.notification',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: { type: 'email' },
    };

    const highPriorityPayload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.payment.failed',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: { type: 'alert' },
    };

    // Add jobs with different priorities
    const lowJob = await queue.add('notification', lowPriorityPayload, { priority: 10 });
    const highJob = await queue.add('payment.failed', highPriorityPayload, { priority: 1 });

    // Verify priorities were set correctly on the job options
    expect(lowJob.opts.priority).toBe(10);
    expect(highJob.opts.priority).toBe(1);

    // Verify jobs were created with correct names
    expect(lowJob.name).toBe('notification');
    expect(highJob.name).toBe('payment.failed');

    // Verify job data is correct
    expect(lowJob.data.eventType).toBe('business.notification');
    expect(highJob.data.eventType).toBe('business.payment.failed');
  });

  it('should handle job failure and retry', async () => {
    let attempts = 0;

    worker = new Worker<TestTaskPayload>(
      TEST_QUEUE_NAME,
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return { success: true };
      },
      {
        connection: redis,
        settings: {
          backoffStrategy: () => 50, // Fast retry for test
        },
      }
    );

    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: {},
    };

    await queue.add('order.paid', payload, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 50 },
    });

    // Wait for retries
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(attempts).toBe(3);

    await worker.close();
    worker = null;
  });

  it('should get job status', async () => {
    const payload: TestTaskPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId: 'test-tenant',
      correlationId: crypto.randomUUID(),
      data: {},
    };

    const job = await queue.add('order.paid', payload);

    const state = await job.getState();
    expect(['waiting', 'active', 'delayed']).toContain(state);

    const jobData = await queue.getJob(job.id!);
    expect(jobData).toBeDefined();
    expect(jobData?.data.eventId).toBe(payload.eventId);
  });

  it('should get queue metrics', async () => {
    // Add some jobs
    for (let i = 0; i < 5; i++) {
      await queue.add(`job-${i}`, {
        eventId: crypto.randomUUID(),
        eventType: 'test',
        tenantId: 'test-tenant',
        correlationId: crypto.randomUUID(),
        data: { index: i },
      });
    }

    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();

    expect(waiting).toBe(5);
    expect(active).toBe(0);
    expect(completed).toBeGreaterThanOrEqual(0);
    expect(failed).toBeGreaterThanOrEqual(0);
  });
});

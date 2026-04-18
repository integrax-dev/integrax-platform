import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { IQueueAdapter, EnqueueOptions, JobStatus } from './queue-adapter.js';

export class BullMQAdapter implements IQueueAdapter {
  private readonly queues = new Map<string, Queue>();
  private readonly connection: Redis;

  constructor(connection: Redis) {
    this.connection = connection;
  }

  private queue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: this.connection }));
    }
    return this.queues.get(name)!;
  }

  async enqueue<T>(queueName: string, jobName: string, data: T, opts?: EnqueueOptions): Promise<string> {
    const job = await this.queue(queueName).add(jobName, data, {
      delay: opts?.delay,
      priority: opts?.priority,
      attempts: opts?.attempts ?? 3,
      jobId: opts?.jobId,
      ...(opts?.backoff ? { backoff: opts.backoff } : { backoff: { type: 'exponential', delay: 1000 } }),
    });
    return job.id ?? '';
  }

  async getJob(queueName: string, jobId: string): Promise<JobStatus | null> {
    const job = await this.queue(queueName).getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id ?? '',
      name: job.name,
      status: state as JobStatus['status'],
      attemptsMade: job.attemptsMade,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  async sendToDlq<T>(queueName: string, jobName: string, data: T, reason: string): Promise<string> {
    return this.enqueue(`${queueName}-dlq`, jobName, { ...( data as object), _dlqReason: reason, _dlqAt: new Date().toISOString() }, {
      attempts: 1,
    });
  }
}

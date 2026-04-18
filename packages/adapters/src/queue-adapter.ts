export interface EnqueueOptions {
  delay?: number;       // ms
  priority?: number;    // higher = more priority
  attempts?: number;    // max retries
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  jobId?: string;       // for deduplication
  ttl?: number;         // ms before job is discarded if not picked up
}

export interface JobStatus {
  id: string;
  name: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attemptsMade: number;
  data: unknown;
  result?: unknown;
  failedReason?: string;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
}

/** Provider-agnostic queue interface. Implement for BullMQ, SQS, RabbitMQ, etc. */
export interface IQueueAdapter {
  enqueue<T>(queueName: string, jobName: string, data: T, opts?: EnqueueOptions): Promise<string>;
  getJob(queueName: string, jobId: string): Promise<JobStatus | null>;
  /** Move a job directly to the DLQ */
  sendToDlq<T>(queueName: string, jobName: string, data: T, reason: string): Promise<string>;
}

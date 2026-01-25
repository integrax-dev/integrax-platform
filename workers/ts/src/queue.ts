import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import type { TaskPayload } from './worker.js';

let queue: Queue<TaskPayload> | null = null;

export function getQueue(): Queue<TaskPayload> {
  if (!queue) {
    const connection = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    });

    queue = new Queue<TaskPayload>(config.WORKER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  return queue;
}

export async function enqueueTask(
  payload: TaskPayload,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<string> {
  const q = getQueue();

  const job = await q.add(payload.eventType, payload, {
    delay: options?.delay,
    priority: options?.priority,
    jobId: options?.jobId ?? `${payload.eventType}-${payload.eventId}`,
  });

  return job.id ?? '';
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

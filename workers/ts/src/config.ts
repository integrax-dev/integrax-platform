import { z } from 'zod';

const ConfigSchema = z.object({
  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Postgres
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('integrax'),
  POSTGRES_PASSWORD: z.string().default('integrax'),
  POSTGRES_DB: z.string().default('integrax'),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  WORKER_QUEUE_NAME: z.string().default('integrax-tasks'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const config = ConfigSchema.parse(process.env);

export type Config = z.infer<typeof ConfigSchema>;

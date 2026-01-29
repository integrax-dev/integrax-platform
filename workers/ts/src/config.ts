import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

// In production, require all credentials (no defaults)
const ConfigSchema = z.object({
  // Redis - required in production
  REDIS_HOST: isProduction
    ? z.string({ required_error: 'REDIS_HOST is required in production' })
    : z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: isProduction
    ? z.string({ required_error: 'REDIS_PASSWORD is required in production' })
    : z.string().optional(),

  // Postgres - required in production
  POSTGRES_HOST: isProduction
    ? z.string({ required_error: 'POSTGRES_HOST is required in production' })
    : z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: isProduction
    ? z.string({ required_error: 'POSTGRES_USER is required in production' })
    : z.string().default('integrax'),
  POSTGRES_PASSWORD: isProduction
    ? z.string({ required_error: 'POSTGRES_PASSWORD is required in production' })
    : z.string().default('integrax'),
  POSTGRES_DB: z.string().default('integrax'),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  WORKER_QUEUE_NAME: z.string().default('integrax-tasks'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Warn in development about missing credentials
if (!isProduction) {
  if (!process.env.REDIS_HOST) {
    console.warn('[Config] WARNING: Using localhost Redis. Set REDIS_HOST in production!');
  }
  if (!process.env.POSTGRES_HOST) {
    console.warn('[Config] WARNING: Using localhost PostgreSQL. Set POSTGRES_HOST in production!');
  }
  if (!process.env.POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD === 'integrax') {
    console.warn('[Config] WARNING: Using default PostgreSQL password. Set POSTGRES_PASSWORD in production!');
  }
}

export const config = ConfigSchema.parse(process.env);

export type Config = z.infer<typeof ConfigSchema>;

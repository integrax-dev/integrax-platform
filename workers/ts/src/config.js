import { z } from 'zod';
const isProduction = process.env.NODE_ENV === 'production';
const ConfigSchema = z.object({
    // Redis - required
    REDIS_HOST: z.string({ required_error: 'REDIS_HOST is required' }),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string({ required_error: 'REDIS_PASSWORD is required' }).optional(),
    // Postgres - required
    POSTGRES_HOST: z.string({ required_error: 'POSTGRES_HOST is required' }),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string({ required_error: 'POSTGRES_USER is required' }),
    POSTGRES_PASSWORD: z.string({ required_error: 'POSTGRES_PASSWORD is required' }),
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
//# sourceMappingURL=config.js.map
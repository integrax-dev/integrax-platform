import { z } from 'zod';
declare const ConfigSchema: z.ZodObject<{
    REDIS_HOST: z.ZodString;
    REDIS_PORT: z.ZodDefault<z.ZodNumber>;
    REDIS_PASSWORD: z.ZodOptional<z.ZodString>;
    POSTGRES_HOST: z.ZodString;
    POSTGRES_PORT: z.ZodDefault<z.ZodNumber>;
    POSTGRES_USER: z.ZodString;
    POSTGRES_PASSWORD: z.ZodString;
    POSTGRES_DB: z.ZodDefault<z.ZodString>;
    WORKER_CONCURRENCY: z.ZodDefault<z.ZodNumber>;
    WORKER_QUEUE_NAME: z.ZodDefault<z.ZodString>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "production" | "development" | "test";
    REDIS_HOST: string;
    REDIS_PORT: number;
    POSTGRES_HOST: string;
    POSTGRES_PORT: number;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    POSTGRES_DB: string;
    WORKER_CONCURRENCY: number;
    WORKER_QUEUE_NAME: string;
    LOG_LEVEL: "debug" | "info" | "warn" | "error";
    REDIS_PASSWORD?: string | undefined;
}, {
    REDIS_HOST: string;
    POSTGRES_HOST: string;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    NODE_ENV?: "production" | "development" | "test" | undefined;
    REDIS_PORT?: number | undefined;
    REDIS_PASSWORD?: string | undefined;
    POSTGRES_PORT?: number | undefined;
    POSTGRES_DB?: string | undefined;
    WORKER_CONCURRENCY?: number | undefined;
    WORKER_QUEUE_NAME?: string | undefined;
    LOG_LEVEL?: "debug" | "info" | "warn" | "error" | undefined;
}>;
export declare const config: {
    NODE_ENV: "production" | "development" | "test";
    REDIS_HOST: string;
    REDIS_PORT: number;
    POSTGRES_HOST: string;
    POSTGRES_PORT: number;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    POSTGRES_DB: string;
    WORKER_CONCURRENCY: number;
    WORKER_QUEUE_NAME: string;
    LOG_LEVEL: "debug" | "info" | "warn" | "error";
    REDIS_PASSWORD?: string | undefined;
};
export type Config = z.infer<typeof ConfigSchema>;
export {};
//# sourceMappingURL=config.d.ts.map
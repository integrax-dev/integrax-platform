/**
 * @integrax/logger
 *
 * Structured logging for IntegraX platform.
 * - JSON output in production, pretty-printed in development
 * - Automatic service/version/environment fields
 * - Child loggers with tenantId + correlationId
 * - Express middleware for request logging
 */

import pinoModule from 'pino';
import type { IncomingMessage, ServerResponse } from 'http';

// Pino ESM compat: handle default export quirks
const pino = (pinoModule as any).default || pinoModule;
type PinoLogger = pinoModule.Logger;

// ============================================
// Types
// ============================================

export interface LoggerOptions {
    /** Service name (e.g. 'control-plane', 'kafka-consumer') */
    service: string;
    /** Service version */
    version?: string;
    /** Log level override */
    level?: string;
    /** Extra base fields */
    base?: Record<string, unknown>;
}

export interface RequestLoggerOptions {
    /** Paths to exclude from logging (e.g. /health, /ready) */
    excludePaths?: string[];
    /** Header name for correlation ID */
    correlationHeader?: string;
}

// ============================================
// Logger Factory
// ============================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Create a structured logger for a service.
 *
 * @example
 * const logger = createLogger({ service: 'control-plane', version: '0.1.0' });
 * logger.info({ tenantId: 'abc' }, 'Tenant created');
 */
export function createLogger(options: LoggerOptions): PinoLogger {
    const level = options.level || process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

    const transport = IS_PRODUCTION
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        };

    return pino({
        level,
        ...(transport ? { transport } : {}),
        base: {
            service: options.service,
            version: options.version || '0.1.0',
            env: process.env.NODE_ENV || 'development',
            ...options.base,
        },
        timestamp: pinoModule.stdTimeFunctions.isoTime,
        formatters: {
            level(label: string) {
                return { level: label };
            },
        },
        serializers: {
            err: pinoModule.stdSerializers.err,
            req: pinoModule.stdSerializers.req,
            res: pinoModule.stdSerializers.res,
        },
    }) as PinoLogger;
}

// ============================================
// Express Request Logger Middleware
// ============================================

/**
 * Express middleware that logs every request with duration, status, and correlation ID.
 *
 * @example
 * app.use(requestLogger(logger, { excludePaths: ['/health', '/ready'] }));
 */
export function requestLogger(
    logger: PinoLogger,
    options: RequestLoggerOptions = {}
) {
    const excludePaths = new Set(options.excludePaths || ['/health', '/ready']);
    const correlationHeader = options.correlationHeader || 'x-request-id';

    return (req: IncomingMessage & { correlationId?: string }, res: ServerResponse, next: () => void) => {
        const path = (req as any).path || req.url || '/';

        if (excludePaths.has(path)) {
            return next();
        }

        // Extract or generate correlation ID
        const correlationId =
            (req.headers[correlationHeader] as string) ||
            crypto.randomUUID();

        // Attach to request for downstream use
        req.correlationId = correlationId;

        // Set correlation ID on response
        res.setHeader('x-correlation-id', correlationId);

        const start = Date.now();
        const method = req.method || 'GET';

        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusCode = res.statusCode;

            const logData = {
                method,
                path,
                statusCode,
                duration,
                correlationId,
                tenantId: (req as any).tenantId,
            };

            if (statusCode >= 500) {
                logger.error(logData, `${method} ${path} ${statusCode} ${duration}ms`);
            } else if (statusCode >= 400) {
                logger.warn(logData, `${method} ${path} ${statusCode} ${duration}ms`);
            } else {
                logger.info(logData, `${method} ${path} ${statusCode} ${duration}ms`);
            }
        });

        next();
    };
}

// ============================================
// Child Logger Helpers
// ============================================

/**
 * Create a child logger bound to a specific tenant.
 */
export function tenantLogger(logger: PinoLogger, tenantId: string): PinoLogger {
    return logger.child({ tenantId });
}

/**
 * Create a child logger bound to a correlation ID.
 */
export function correlationLogger(logger: PinoLogger, correlationId: string): PinoLogger {
    return logger.child({ correlationId });
}

// Re-export pino types for convenience
export type Logger = PinoLogger;
export { pinoModule as pino };

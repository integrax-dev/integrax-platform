/**
 * @integrax/health
 *
 * Health and readiness checks for IntegraX platform services.
 *
 * - `/health` (liveness): always 200 if process is running
 * - `/ready` (readiness): 200 only if all registered dependencies respond
 * - `/metrics` (prometheus): exposes Prometheus metrics from @integrax/metrics
 */

import { Router, Request, Response } from 'express';
import { getMetrics, getMetricsContentType } from '@integrax/metrics';

// ============================================
// Types
// ============================================

export interface HealthCheckResult {
    name: string;
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    error?: string;
}

export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    timestamp: string;
    checks: HealthCheckResult[];
}

type HealthCheckFn = () => Promise<void>;

// ============================================
// Health Manager
// ============================================

export class HealthManager {
    private checks: Map<string, HealthCheckFn> = new Map();
    private version: string;
    private startTime: number;

    constructor(version = '0.1.0') {
        this.version = version;
        this.startTime = Date.now();
    }

    /**
     * Register a dependency health check.
     *
     * @example
     * health.register('redis', async () => { await redis.ping(); });
     * health.register('kafka', async () => { await admin.describeCluster(); });
     */
    register(name: string, check: HealthCheckFn): void {
        this.checks.set(name, check);
    }

    /**
     * Run all registered checks and return aggregated result.
     */
    async runChecks(): Promise<HealthResponse> {
        const results: HealthCheckResult[] = [];

        for (const [name, checkFn] of this.checks) {
            const start = Date.now();
            try {
                await checkFn();
                results.push({
                    name,
                    status: 'healthy',
                    latencyMs: Date.now() - start,
                });
            } catch (err: any) {
                results.push({
                    name,
                    status: 'unhealthy',
                    latencyMs: Date.now() - start,
                    error: err.message || String(err),
                });
            }
        }

        const unhealthy = results.filter((r) => r.status === 'unhealthy');
        let status: HealthResponse['status'] = 'healthy';
        if (unhealthy.length > 0 && unhealthy.length < results.length) {
            status = 'degraded';
        } else if (unhealthy.length === results.length && results.length > 0) {
            status = 'unhealthy';
        }

        return {
            status,
            version: this.version,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            timestamp: new Date().toISOString(),
            checks: results,
        };
    }

    /**
     * Create an Express router with /health, /ready, and /metrics endpoints.
     */
    router(): Router {
        const router = Router();

        // Liveness — always 200 if process is running
        router.get('/health', (_req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                version: this.version,
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                timestamp: new Date().toISOString(),
            });
        });

        // Readiness — 200 only if all dependencies are healthy
        router.get('/ready', async (_req: Request, res: Response) => {
            const result = await this.runChecks();
            const statusCode = result.status === 'unhealthy' ? 503 : 200;
            res.status(statusCode).json(result);
        });

        // Prometheus metrics
        router.get('/metrics', async (_req: Request, res: Response) => {
            try {
                const metricsOutput = await getMetrics();
                res.set('Content-Type', getMetricsContentType());
                res.end(metricsOutput);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        return router;
    }
}

/**
 * Create a HealthManager instance.
 *
 * @example
 * const health = createHealthManager('0.1.0');
 * health.register('redis', async () => { await redis.ping(); });
 * app.use(health.router());
 */
export function createHealthManager(version?: string): HealthManager {
    return new HealthManager(version);
}

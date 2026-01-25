import type { Worker } from 'bullmq';
import type { AuditLogger } from './audit.js';
import { createLogger } from './logger.js';

const logger = createLogger('shutdown');

export function gracefulShutdown(workers: Worker[], auditLogger: AuditLogger): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop accepting new jobs
    for (const worker of workers) {
      logger.info('Closing worker...');
      await worker.close();
    }

    // Close audit logger connection
    await auditLogger.close();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

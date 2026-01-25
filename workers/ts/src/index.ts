import 'dotenv/config';
import { createWorker } from './worker.js';
import { createAuditLogger } from './audit.js';
import { createLogger } from './logger.js';
import { gracefulShutdown } from './shutdown.js';

const logger = createLogger('main');

async function main() {
  logger.info('Starting IntegraX Worker...');

  // Initialize audit logger
  const auditLogger = await createAuditLogger();

  // Create and start worker
  const worker = await createWorker(auditLogger);

  // Setup graceful shutdown
  gracefulShutdown([worker], auditLogger);

  logger.info('IntegraX Worker started successfully');
}

main().catch(err => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});

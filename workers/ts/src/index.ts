import 'dotenv/config';
import { createWorker } from './worker.js';
import { createAuditLogger } from './audit.js';
import { createLogger } from './logger.js';
import { gracefulShutdown } from './shutdown.js';

const logger = createLogger('main');

async function main() {
  logger.info('Starting IntegraX Worker...');

  // Inicializar el logger de auditoría
  const auditLogger = await createAuditLogger();

  // Crear e iniciar el worker
  const worker = await createWorker(auditLogger);

  // Configurar el apagado gradual
  gracefulShutdown([worker], auditLogger);

  logger.info('IntegraX Worker started successfully');
}

main().catch(err => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});

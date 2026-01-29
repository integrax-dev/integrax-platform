// Logger
import { createLogger } from '../../../workers/ts/src/logger.js';
const logger = createLogger('temporal-worker');
/**
 * Temporal Worker
 *
 * Ejecuta workflows y activities de IntegraX.
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from 'dotenv';

// Load environment variables
config();

// Import activities
import * as paymentActivities from '../activities/payment-activities.js';
import * as orderActivities from '../activities/order-activities.js';
import * as connectorActivities from '../activities/connector-activities.js';

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'integrax-workflows';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

async function run() {
  logger.info(`INTEGRAX - Temporal Worker`);
  logger.info(`Task Queue: ${TASK_QUEUE}`);
  logger.info(`Temporal:   ${TEMPORAL_ADDRESS}`);

  // Connect to Temporal server
  logger.info('Connecting to Temporal server...');
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  logger.info('Connection established. Starting worker...');

  // Create and start worker
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: new URL('../workflows/index.js', import.meta.url).pathname,
    activities: {
      ...paymentActivities,
      ...orderActivities,
      ...connectorActivities,
    },
  });

  logger.info(`Worker started. Listening on task queue: ${TASK_QUEUE}`);
  logger.info('Press Ctrl+C to stop.');

  // Handle shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    await worker.shutdown();
    await connection.close();
    logger.info('Worker stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Run the worker
  await worker.run();
}

run().catch((err) => {
  console.error('Worker error:', err);
  process.exit(1);
});

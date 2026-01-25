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

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'integrax-workflows';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

async function run() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   INTEGRAX - Temporal Worker                              ║
╠═══════════════════════════════════════════════════════════╣
║   Task Queue: ${TASK_QUEUE.padEnd(40)}║
║   Temporal:   ${TEMPORAL_ADDRESS.padEnd(40)}║
╚═══════════════════════════════════════════════════════════╝
`);

  // Connect to Temporal server
  console.log('Connecting to Temporal server...');
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  console.log('Connection established. Starting worker...');

  // Create and start worker
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: new URL('../workflows/index.js', import.meta.url).pathname,
    activities: {
      ...paymentActivities,
      ...orderActivities,
    },
  });

  console.log(`Worker started. Listening on task queue: ${TASK_QUEUE}`);
  console.log('Press Ctrl+C to stop.\n');

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down worker...');
    await worker.shutdown();
    await connection.close();
    console.log('Worker stopped.');
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

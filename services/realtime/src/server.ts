/**
 * IntegraX Realtime Server
 *
 * WebSocket server entry point.
 */

import { RealtimeServer } from './index.js';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const PORT = parsePositiveInt(process.env.WS_PORT, 3003);

if (!process.env.JWT_SECRET) {
  console.error('[Realtime] FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

if (!process.env.REDIS_URL) {
  console.error('[Realtime] FATAL: REDIS_URL environment variable is not set');
  process.exit(1);
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗███╗   ██╗████████╗███████╗ ██████╗ ██████╗  █████╗      ║
║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝ ██╔══██╗██╔══██╗     ║
║   ██║██╔██╗ ██║   ██║   █████╗  ██║  ███╗██████╔╝███████║     ║
║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██╔══██║     ║
║   ██║██║ ╚████║   ██║   ███████╗╚██████╔╝██║  ██║██║  ██║     ║
║   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝     ║
║                                                               ║
║              Realtime WebSocket Server v0.1.0                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

  const server = new RealtimeServer({ port: PORT });

  await server.start();

  const HOST = process.env.HOST || '0.0.0.0';
  console.log(`
Realtime Server running on ws://${HOST}:${PORT}

Connection URL: ws://${HOST}:${PORT}?token=<JWT_TOKEN>

Channels:
  - workflows    Workflow execution events
  - events       Event processing notifications
  - connectors   Connector call status
  - alerts       System alerts and warnings
  - system       Connection status

Example client connection:
  const ws = new WebSocket('ws://' + HOST + ':${PORT}?token=YOUR_JWT');
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'workflows' }));
`);

  // Log stats periodically
  const statsInterval = setInterval(() => {
    const stats = server.getStats();
    if (stats.totalConnections > 0) {
      console.log(`[Realtime] Stats: ${stats.totalConnections} connections`);
    }
  }, 60000);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[Realtime] Received ${signal}, shutting down...`);
    clearInterval(statsInterval);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}
main().catch((error) => {
  console.error('[Realtime] Failed to start server:', error);
  process.exit(1);
});

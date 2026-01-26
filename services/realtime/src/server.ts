/**
 * IntegraX Realtime Server
 *
 * WebSocket server entry point.
 */

import { RealtimeServer } from './index.js';

const PORT = parseInt(process.env.WS_PORT || '3003', 10);

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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Realtime] Received ${signal}, shutting down...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await server.start();

  console.log(`
Realtime Server running on ws://localhost:${PORT}

Connection URL: ws://localhost:${PORT}?token=<JWT_TOKEN>

Channels:
  - workflows    Workflow execution events
  - events       Event processing notifications
  - connectors   Connector call status
  - alerts       System alerts and warnings
  - system       Connection status

Example client connection:
  const ws = new WebSocket('ws://localhost:${PORT}?token=YOUR_JWT');
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'workflows' }));
`);

  // Log stats periodically
  setInterval(() => {
    const stats = server.getStats();
    if (stats.totalConnections > 0) {
      console.log(`[Realtime] Stats: ${stats.totalConnections} connections`);
    }
  }, 60000);
}

main().catch((error) => {
  console.error('[Realtime] Failed to start server:', error);
  process.exit(1);
});

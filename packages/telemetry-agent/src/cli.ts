#!/usr/bin/env tsx
/**
 * Telemetry agent CLI — run as sidecar:
 *   INTEGRAX_LICENSE_KEY=ixl_xxx INTEGRAX_INGEST_URL=https://api.integrax.dev/telemetry/ingest \
 *   node integrax-telemetry
 *
 * Reads NDJSON logs from stdin and forwards them (sanitized) to the ingest endpoint.
 */

import { TelemetryAgent } from './agent.js';
import * as readline from 'readline';

const licenseKey = process.env['INTEGRAX_LICENSE_KEY'];
const ingestUrl = process.env['INTEGRAX_INGEST_URL'] ?? 'https://api.integrax.dev/telemetry/ingest';
const heartbeatUrl = process.env['INTEGRAX_HEARTBEAT_URL'] ?? 'https://api.integrax.dev/license/heartbeat';
const enabled = process.env['INTEGRAX_TELEMETRY_ENABLED'] !== 'false';

if (!licenseKey) {
  console.error('[telemetry-agent] INTEGRAX_LICENSE_KEY not set — exiting');
  process.exit(1);
}

const agent = new TelemetryAgent({ licenseKey, ingestUrl, heartbeatUrl, enabled });
agent.start();

console.error(`[telemetry-agent] started — ingest: ${ingestUrl}`);

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line: string) => agent.ingestLogLine(line));
rl.on('close', () => { void agent.stop().then(() => process.exit(0)); });

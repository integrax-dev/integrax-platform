#!/usr/bin/env node
/**
 * IntegraX seed CLI
 *
 * Usage:
 *   node src/cli.ts all
 *   node src/cli.ts connectors
 *   node src/cli.ts mappings
 *   node src/cli.ts signals
 */

import { CONNECTOR_SEEDS } from './connectors.js';
import { MAPPING_SEEDS } from './mappings.js';
import { DEMO_TENANT_SEEDS } from './demo-tenants.js';
import { SIGNAL_SEEDS } from './signals.js';

const [, , command = 'all'] = process.argv;

function printJson(label: string, data: unknown[]): void {
  console.log(`\n── ${label} (${data.length} records) ──`);
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case 'connectors':   printJson('Connector seeds',    CONNECTOR_SEEDS);   break;
  case 'mappings':     printJson('Mapping seeds',      MAPPING_SEEDS);     break;
  case 'tenants':      printJson('Demo tenant seeds',  DEMO_TENANT_SEEDS); break;
  case 'signals':      printJson('Signal seeds',       SIGNAL_SEEDS);      break;
  case 'all':
    printJson('Connector seeds',    CONNECTOR_SEEDS);
    printJson('Mapping seeds',      MAPPING_SEEDS);
    printJson('Demo tenant seeds',  DEMO_TENANT_SEEDS);
    printJson('Signal seeds',       SIGNAL_SEEDS);
    break;
  default:
    console.error(`Unknown command: '${command}'. Use: all | connectors | mappings | tenants | signals`);
    process.exit(1);
}

#!/usr/bin/env node
/**
 * IntegraX seed CLI
 *
 * Usage:
 *   node src/cli.ts all
 *   node src/cli.ts connectors
 *   node src/cli.ts mappings
 *   node src/cli.ts tenants
 *   node src/cli.ts signals
 *   node src/cli.ts tolerances
 *   node src/cli.ts language
 */

import { CONNECTOR_SEEDS } from './connectors.js';
import { MAPPING_SEEDS } from './mappings.js';
import { DEMO_TENANT_SEEDS } from './demo-tenants.js';
import { SIGNAL_SEEDS } from './signals.js';
import { TOLERANCE_SEEDS } from './tolerance-seeds.js';
import { LANGUAGE_SEEDS, ALL_SYNONYM_PAIRS } from './language-seeds.js';

const [, , command = 'all'] = process.argv;

function printJson(label: string, data: unknown[]): void {
  console.log(`\n── ${label} (${data.length} records) ──`);
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case 'connectors':  printJson('Connector seeds',    CONNECTOR_SEEDS);   break;
  case 'mappings':    printJson('Mapping seeds',      MAPPING_SEEDS);     break;
  case 'tenants':     printJson('Demo tenant seeds',  DEMO_TENANT_SEEDS); break;
  case 'signals':     printJson('Signal seeds',       SIGNAL_SEEDS);      break;
  case 'tolerances':  printJson('Tolerance seeds',    TOLERANCE_SEEDS);   break;
  case 'language':
    printJson('Language seeds (structured)', LANGUAGE_SEEDS);
    printJson('All synonym pairs (flat)',    ALL_SYNONYM_PAIRS);
    break;
  case 'all':
    printJson('Connector seeds',    CONNECTOR_SEEDS);
    printJson('Mapping seeds',      MAPPING_SEEDS);
    printJson('Demo tenant seeds',  DEMO_TENANT_SEEDS);
    printJson('Signal seeds',       SIGNAL_SEEDS);
    printJson('Tolerance seeds',    TOLERANCE_SEEDS);
    printJson('Language seeds',     LANGUAGE_SEEDS);
    break;
  default:
    console.error(`Unknown command: '${command}'. Use: all | connectors | mappings | tenants | signals | tolerances | language`);
    process.exit(1);
}

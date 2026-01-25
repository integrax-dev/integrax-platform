#!/usr/bin/env npx tsx
/**
 * Setup Debezium Connector
 *
 * Registers the PostgreSQL connector with Debezium for CDC.
 *
 * Usage:
 *   pnpm tsx scripts/setup-debezium.ts
 */

import { config } from 'dotenv';
config();

const DEBEZIUM_URL = process.env.DEBEZIUM_URL || 'http://localhost:8083';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

const connectorConfig = {
  name: 'integrax-postgres-connector',
  config: {
    'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
    'database.hostname': 'postgres',
    'database.port': '5432',
    'database.user': 'integrax',
    'database.password': 'integrax',
    'database.dbname': 'integrax',
    'database.server.name': 'integrax',
    'topic.prefix': 'integrax',
    'table.include.list': 'public.payments,public.orders,public.invoices,public.outbox',
    'publication.name': 'integrax_cdc',
    'slot.name': 'integrax_slot',
    'plugin.name': 'pgoutput',
    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'key.converter.schemas.enable': 'false',
    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'value.converter.schemas.enable': 'false',
    'transforms': 'unwrap',
    'transforms.unwrap.type': 'io.debezium.transforms.ExtractNewRecordState',
    'transforms.unwrap.drop.tombstones': 'true',
    'transforms.unwrap.delete.handling.mode': 'rewrite',
  },
};

async function checkDebeziumHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${DEBEZIUM_URL}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function listConnectors(): Promise<string[]> {
  const response = await fetch(`${DEBEZIUM_URL}/connectors`);
  if (!response.ok) {
    throw new Error(`Failed to list connectors: ${response.statusText}`);
  }
  return response.json();
}

async function deleteConnector(name: string): Promise<void> {
  const response = await fetch(`${DEBEZIUM_URL}/connectors/${name}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete connector: ${response.statusText}`);
  }
}

async function createConnector(): Promise<void> {
  const response = await fetch(`${DEBEZIUM_URL}/connectors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(connectorConfig),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create connector: ${error}`);
  }
}

async function getConnectorStatus(name: string): Promise<unknown> {
  const response = await fetch(`${DEBEZIUM_URL}/connectors/${name}/status`);
  if (!response.ok) {
    throw new Error(`Failed to get connector status: ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║         DEBEZIUM CDC CONNECTOR SETUP                      ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  log(`Debezium URL: ${DEBEZIUM_URL}`, colors.cyan);

  // Check if Debezium is healthy
  log('→ Checking Debezium health...', colors.cyan);
  const healthy = await checkDebeziumHealth();

  if (!healthy) {
    log('✗ Debezium is not running or not healthy', colors.red);
    log('  Make sure Docker enterprise stack is running:', colors.yellow);
    log('  pnpm docker:enterprise', colors.reset);
    process.exit(1);
  }

  log('✓ Debezium is healthy', colors.green);

  // List existing connectors
  log('→ Listing existing connectors...', colors.cyan);
  const connectors = await listConnectors();
  log(`  Found ${connectors.length} connector(s): ${connectors.join(', ') || 'none'}`, colors.reset);

  // Delete existing connector if it exists
  if (connectors.includes(connectorConfig.name)) {
    log(`→ Deleting existing connector: ${connectorConfig.name}...`, colors.cyan);
    await deleteConnector(connectorConfig.name);
    log('✓ Deleted', colors.green);
  }

  // Create new connector
  log('→ Creating PostgreSQL CDC connector...', colors.cyan);
  try {
    await createConnector();
    log('✓ Connector created', colors.green);
  } catch (error) {
    log(`✗ Failed to create connector: ${error}`, colors.red);
    process.exit(1);
  }

  // Wait a bit and check status
  log('→ Waiting for connector to initialize...', colors.cyan);
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const status = await getConnectorStatus(connectorConfig.name);
    log('✓ Connector status:', colors.green);
    console.log(JSON.stringify(status, null, 2));
  } catch (error) {
    log(`⚠ Could not get connector status: ${error}`, colors.yellow);
  }

  console.log(`
${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}

${colors.green}✓ Debezium CDC connector setup complete!${colors.reset}

The following tables are being monitored for changes:
  - payments
  - orders
  - invoices
  - outbox

Changes will be published to Kafka topics:
  - integrax.public.payments
  - integrax.public.orders
  - integrax.public.invoices
  - integrax.public.outbox

View Kafka topics at: http://localhost:8080 (Kafka UI)
`);
}

main().catch((err) => {
  log(`Error: ${err.message}`, colors.red);
  process.exit(1);
});

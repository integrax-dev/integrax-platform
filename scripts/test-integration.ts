/**
 * IntegraX - Test de Integración Completo
 *
 * Prueba todos los componentes del sistema:
 * - MVP: Redis, Postgres, MercadoPago, Google Sheets
 * - Enterprise: Kafka, Temporal (si están corriendo)
 * - LLM Orchestrator: Tools, Connectors Registry
 * - Argentina: CUIT, IVA, Phone formatting
 */

import { config } from 'dotenv';
config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const log = {
  section: (msg: string) => console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}\n${colors.cyan}  ${msg}${colors.reset}\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`),
  test: (name: string) => process.stdout.write(`  ${colors.dim}Testing:${colors.reset} ${name}... `),
  pass: () => console.log(`${colors.green}✓ PASS${colors.reset}`),
  fail: (err: string) => console.log(`${colors.red}✗ FAIL${colors.reset} - ${err}`),
  skip: (reason: string) => console.log(`${colors.yellow}○ SKIP${colors.reset} - ${reason}`),
  info: (msg: string) => console.log(`  ${colors.blue}ℹ${colors.reset} ${msg}`),
};

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  log.test(name);
  try {
    await fn();
    log.pass();
    results.push({ name, passed: true, skipped: false });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.fail(errMsg);
    results.push({ name, passed: false, skipped: false, error: errMsg });
  }
}

function skipTest(name: string, reason: string): void {
  log.test(name);
  log.skip(reason);
  results.push({ name, passed: false, skipped: true, error: reason });
}

// ==================== Tests ====================

async function testRedis(): Promise<void> {
  const Redis = (await import('ioredis')).default;
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  try {
    await redis.ping();
    await redis.set('integrax:test', 'ok', 'EX', 10);
    const value = await redis.get('integrax:test');
    if (value !== 'ok') throw new Error('Redis read/write failed');
  } finally {
    redis.disconnect();
  }
}

async function testPostgres(): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://integrax:integrax@localhost:5432/integrax',
    connectionTimeoutMillis: 3000,
  });

  try {
    const result = await pool.query('SELECT NOW() as now');
    if (!result.rows[0].now) throw new Error('Postgres query failed');
  } finally {
    await pool.end();
  }
}

async function testMercadoPago(): Promise<void> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not set');

  const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid response');
}

async function testGoogleSheets(): Promise<void> {
  const credsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!credsJson || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS or SPREADSHEET_ID not set');
  }

  const { GoogleAuth } = await import('google-auth-library');
  const creds = JSON.parse(credsJson);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get access token');

  // Try to read spreadsheet metadata
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
    { headers: { Authorization: `Bearer ${token.token}` } }
  );

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function testKafka(): Promise<void> {
  const net = await import('net');
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const [host, portStr] = brokers[0].split(':');
  const port = parseInt(portStr, 10);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      resolve();
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(new Error(`Connection failed: ${err.message}`));
    });

    socket.connect(port, host);
  });
}

async function testLLMTools(): Promise<void> {
  // Import the tools and connectors registry
  const { ToolExecutor, INTEGRAX_CONNECTORS } = await import('../services/llm-orchestrator/src/index');

  const executor = new ToolExecutor(INTEGRAX_CONNECTORS);

  // Test search_connectors
  const searchResult = await executor.execute('search_connectors', { query: 'pago' });
  if (!searchResult.success) throw new Error('search_connectors failed');

  // Test calculate_iva
  const ivaResult = await executor.execute('calculate_iva', { monto: 1000, alicuota: 21 });
  if (!ivaResult.success) throw new Error('calculate_iva failed');
  if ((ivaResult.data as any).total !== 1210) throw new Error('IVA calculation wrong');

  // Test format_cuit
  const cuitResult = await executor.execute('format_cuit', { cuit: '20345678901' });
  if (!cuitResult.success) throw new Error('format_cuit failed');

  // Test get_afip_comprobante_types
  const afipResult = await executor.execute('get_afip_comprobante_types', {
    condicionIVA: 'responsable_inscripto',
    receptorCondicionIVA: 'consumidor_final',
  });
  if (!afipResult.success) throw new Error('get_afip_comprobante_types failed');
  if (!(afipResult.data as any).tipos.includes('Factura B')) throw new Error('Wrong comprobante type');
}

async function testConnectorsRegistry(): Promise<void> {
  const { INTEGRAX_CONNECTORS, getConnector, searchConnectors } = await import(
    '../services/llm-orchestrator/src/index'
  );

  // Check all connectors exist
  const expectedConnectors = ['mercadopago', 'contabilium', 'afip-wsfe', 'whatsapp', 'email', 'google-sheets'];
  for (const id of expectedConnectors) {
    const connector = getConnector(id);
    if (!connector) throw new Error(`Connector ${id} not found`);
    if (!connector.actions.length) throw new Error(`Connector ${id} has no actions`);
  }

  // Test search
  const results = searchConnectors('factura');
  if (results.length === 0) throw new Error('Search returned no results');
}

async function testArgentinaHelpers(): Promise<void> {
  const { ToolExecutor, INTEGRAX_CONNECTORS } = await import('../services/llm-orchestrator/src/index');
  const executor = new ToolExecutor(INTEGRAX_CONNECTORS);

  // Test phone formatting
  const phoneResult = await executor.execute('format_phone_argentina', { phone: '01145551234' });
  if (!phoneResult.success) throw new Error('format_phone_argentina failed');
  if ((phoneResult.data as any).whatsapp !== '5491145551234') {
    throw new Error(`Wrong phone format: ${(phoneResult.data as any).whatsapp}`);
  }

  // Test error solutions for AFIP
  const errorResult = await executor.execute('get_error_solutions', {
    errorMessage: 'CAE error: El campo DocNro es inválido',
    connectorId: 'afip-wsfe',
  });
  if (!errorResult.success) throw new Error('get_error_solutions failed');
  if ((errorResult.data as any).category !== 'afip') throw new Error('Wrong error category');
}

async function testWorkflowValidation(): Promise<void> {
  const { ToolExecutor, INTEGRAX_CONNECTORS } = await import('../services/llm-orchestrator/src/index');
  const executor = new ToolExecutor(INTEGRAX_CONNECTORS);

  // Valid workflow
  const validResult = await executor.execute('validate_workflow', {
    steps: [
      { connectorId: 'mercadopago', actionId: 'create_payment', parameters: { amount: 1000, description: 'Test' } },
      { connectorId: 'whatsapp', actionId: 'send_text', parameters: { to: '5491145551234', text: 'Pago OK' } },
    ],
  });
  if (!validResult.success || !(validResult.data as any).valid) {
    throw new Error('Valid workflow marked as invalid');
  }

  // Invalid workflow
  const invalidResult = await executor.execute('validate_workflow', {
    steps: [{ connectorId: 'invalid', actionId: 'invalid', parameters: {} }],
  });
  if ((invalidResult.data as any).valid) {
    throw new Error('Invalid workflow marked as valid');
  }
}

// ==================== Main ====================

async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗███╗   ██╗████████╗███████╗ ██████╗ ██████╗  █████╗      ║
║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝ ██╔══██╗██╔══██╗     ║
║   ██║██╔██╗ ██║   ██║   █████╗  ██║  ███╗██████╔╝███████║     ║
║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██╔══██║     ║
║   ██║██║ ╚████║   ██║   ███████╗╚██████╔╝██║  ██║██║  ██║     ║
║   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝     ║
║                                                               ║
║              Integration Test Suite                           ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // ===== MVP Tests =====
  log.section('MILESTONE 1: MVP Components');

  await runTest('Redis Connection', testRedis).catch(() => {});
  await runTest('PostgreSQL Connection', testPostgres).catch(() => {});
  await runTest('MercadoPago API', testMercadoPago).catch(() => {});
  await runTest('Google Sheets API', testGoogleSheets).catch(() => {});

  // ===== Enterprise Tests =====
  log.section('MILESTONE 2: Enterprise Stack');

  try {
    await testKafka();
    log.test('Kafka Connection');
    log.pass();
    results.push({ name: 'Kafka Connection', passed: true, skipped: false });
  } catch {
    skipTest('Kafka Connection', 'Kafka not running (optional)');
  }

  skipTest('Temporal Connection', 'Requires Temporal server');
  skipTest('Debezium CDC', 'Requires full enterprise stack');

  // ===== LLM Orchestrator Tests =====
  log.section('MILESTONE 3: LLM Orchestrator');

  await runTest('LLM Tools Execution', testLLMTools).catch(() => {});
  await runTest('Connectors Registry', testConnectorsRegistry).catch(() => {});
  await runTest('Workflow Validation', testWorkflowValidation).catch(() => {});

  // ===== Argentina Tests =====
  log.section('MILESTONE 4: Argentina-grade');

  await runTest('Argentina Helpers (CUIT, Phone, IVA)', testArgentinaHelpers).catch(() => {});
  skipTest('Contabilium API', 'Requires Contabilium credentials');
  skipTest('AFIP WSFE', 'Requires AFIP certificate');
  skipTest('WhatsApp Business API', 'Requires WhatsApp credentials');

  // ===== Summary =====
  log.section('TEST SUMMARY');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const total = results.length;

  console.log(`
  ${colors.green}Passed:${colors.reset}  ${passed}/${total}
  ${colors.red}Failed:${colors.reset}  ${failed}/${total}
  ${colors.yellow}Skipped:${colors.reset} ${skipped}/${total}
`);

  if (failed > 0) {
    console.log(`${colors.red}Failed tests:${colors.reset}`);
    for (const r of results.filter((r) => !r.passed && !r.skipped)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`
${colors.cyan}${'─'.repeat(60)}${colors.reset}
${passed === total - skipped ? colors.green + '  All tests passed!' : colors.yellow + '  Some tests need attention.'}
${colors.cyan}${'─'.repeat(60)}${colors.reset}
`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

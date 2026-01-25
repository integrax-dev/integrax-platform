#!/usr/bin/env npx tsx
/**
 * Script para probar IntegraX con APIs reales.
 *
 * Uso:
 *   npx tsx scripts/test-real.ts
 *
 * Requiere variables de entorno:
 *   MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx
 *   GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}  (opcional)
 *   GOOGLE_SHEETS_SPREADSHEET_ID=1BxiMVs...  (opcional)
 */

import { config } from 'dotenv';
config();

// ============================================
// Colores para output
// ============================================
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function success(msg: string) { log(`✓ ${msg}`, colors.green); }
function error(msg: string) { log(`✗ ${msg}`, colors.red); }
function info(msg: string) { log(`→ ${msg}`, colors.cyan); }
function warn(msg: string) { log(`⚠ ${msg}`, colors.yellow); }
function section(msg: string) { console.log(`\n${colors.cyan}${'='.repeat(60)}\n  ${msg}\n${'='.repeat(60)}${colors.reset}\n`); }

// ============================================
// Test MercadoPago
// ============================================
async function testMercadoPago() {
  section('MERCADOPAGO API TEST');

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    error('MERCADOPAGO_ACCESS_TOKEN no está configurado');
    warn('Configuralo en .env o como variable de entorno');
    return false;
  }

  info(`Token: ${accessToken.substring(0, 20)}...`);

  try {
    // 1. Test de conexión - obtener usuario
    info('Probando conexión...');
    const userResponse = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json();
      error(`Error de autenticación: ${JSON.stringify(errorData)}`);
      return false;
    }

    const userData = await userResponse.json();
    success(`Conectado como: ${userData.nickname || userData.email} (ID: ${userData.id})`);
    info(`País: ${userData.site_id}`);

    // 2. Buscar últimos pagos
    info('Buscando últimos pagos...');
    const paymentsResponse = await fetch(
      'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!paymentsResponse.ok) {
      warn('No se pudieron obtener pagos (puede ser cuenta nueva)');
    } else {
      const paymentsData = await paymentsResponse.json();
      const payments = paymentsData.results || [];

      if (payments.length === 0) {
        warn('No hay pagos en la cuenta (es cuenta de sandbox nueva)');
      } else {
        success(`Encontrados ${payments.length} pagos recientes:`);
        payments.forEach((p: any, i: number) => {
          const status = p.status === 'approved' ? colors.green : colors.yellow;
          console.log(`   ${i + 1}. ${status}${p.status}${colors.reset} - $${p.transaction_amount} ${p.currency_id} - ID: ${p.id}`);
        });

        // 3. Obtener detalle del primer pago
        if (payments[0]) {
          info(`Obteniendo detalle del pago ${payments[0].id}...`);
          const paymentDetail = await fetch(
            `https://api.mercadopago.com/v1/payments/${payments[0].id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (paymentDetail.ok) {
            const detail = await paymentDetail.json();
            success('Detalle del pago:');
            console.log(`   - Monto: $${detail.transaction_amount} ${detail.currency_id}`);
            console.log(`   - Estado: ${detail.status} (${detail.status_detail})`);
            console.log(`   - Método: ${detail.payment_method_id} (${detail.payment_type_id})`);
            console.log(`   - Fecha: ${detail.date_created}`);
            if (detail.payer?.email) {
              console.log(`   - Pagador: ${detail.payer.email}`);
            }
          }
        }
      }
    }

    return true;
  } catch (err) {
    error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================
// Test Google Sheets
// ============================================
async function testGoogleSheets() {
  section('GOOGLE SHEETS API TEST');

  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!credentials) {
    warn('GOOGLE_SHEETS_CREDENTIALS no está configurado');
    info('Salteando test de Google Sheets');
    return null; // null = skipped
  }

  try {
    const creds = JSON.parse(credentials);
    info(`Service Account: ${creds.client_email}`);

    // Importar google-auth-library
    const { GoogleAuth } = await import('google-auth-library');

    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    info('Obteniendo access token...');
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken) {
      error('No se pudo obtener access token');
      return false;
    }

    success('Access token obtenido');

    if (!spreadsheetId) {
      info('GOOGLE_SHEETS_SPREADSHEET_ID no configurado');
      info('Creando nuevo spreadsheet de prueba...');

      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title: 'IntegraX Test - ' + new Date().toISOString() },
          sheets: [{ properties: { title: 'Pagos' } }],
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        error(`Error creando spreadsheet: ${JSON.stringify(errorData)}`);
        return false;
      }

      const created = await createResponse.json();
      success(`Spreadsheet creado: ${created.spreadsheetId}`);
      info(`URL: https://docs.google.com/spreadsheets/d/${created.spreadsheetId}`);
      info(`Agregá este ID a tu .env como GOOGLE_SHEETS_SPREADSHEET_ID`);

      // Escribir datos de prueba
      info('Escribiendo datos de prueba...');
      const writeResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/Pagos!A1:D2?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [
              ['ID', 'Monto', 'Estado', 'Fecha'],
              ['TEST-001', '15000', 'approved', new Date().toISOString()],
            ],
          }),
        }
      );

      if (writeResponse.ok) {
        success('Datos de prueba escritos correctamente');
      }

      return true;
    }

    // Leer spreadsheet existente
    info(`Leyendo spreadsheet ${spreadsheetId}...`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorData = await response.json();
      error(`Error: ${JSON.stringify(errorData)}`);
      return false;
    }

    const data = await response.json();
    success(`Spreadsheet: ${data.properties.title}`);
    info(`Hojas: ${data.sheets.map((s: any) => s.properties.title).join(', ')}`);
    return true;
  } catch (err) {
    error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================
// Test Redis
// ============================================
async function testRedis() {
  section('REDIS TEST');

  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });

    info('Conectando a Redis...');
    const pong = await redis.ping();

    if (pong === 'PONG') {
      success('Redis conectado');

      // Test set/get
      await redis.set('integrax:test', 'ok');
      const value = await redis.get('integrax:test');
      success(`Set/Get funciona: ${value}`);
      await redis.del('integrax:test');
    }

    await redis.quit();
    return true;
  } catch (err) {
    error(`Redis no disponible: ${err instanceof Error ? err.message : String(err)}`);
    warn('Asegurate de que Docker esté corriendo: docker compose up -d redis');
    return false;
  }
}

// ============================================
// Test Postgres
// ============================================
async function testPostgres() {
  section('POSTGRES TEST');

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'integrax',
      password: process.env.POSTGRES_PASSWORD || 'integrax',
      database: process.env.POSTGRES_DB || 'integrax',
    });

    info('Conectando a Postgres...');
    const result = await pool.query('SELECT NOW() as now, current_database() as db');
    success(`Postgres conectado: ${result.rows[0].db}`);
    info(`Hora del servidor: ${result.rows[0].now}`);

    // Check audit_logs table
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'audit_logs'
      ) as exists
    `);

    if (tableCheck.rows[0].exists) {
      const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
      success(`Tabla audit_logs existe (${countResult.rows[0].count} registros)`);
    } else {
      warn('Tabla audit_logs no existe (se creará al iniciar el worker)');
    }

    await pool.end();
    return true;
  } catch (err) {
    error(`Postgres no disponible: ${err instanceof Error ? err.message : String(err)}`);
    warn('Asegurate de que Docker esté corriendo: docker compose up -d postgres');
    return false;
  }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗███╗   ██╗████████╗███████╗ ██████╗ ██████╗  █████╗  ║
║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝ ██╔══██╗██╔══██╗ ║
║   ██║██╔██╗ ██║   ██║   █████╗  ██║  ███╗██████╔╝███████║ ║
║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██╔══██║ ║
║   ██║██║ ╚████║   ██║   ███████╗╚██████╔╝██║  ██║██║  ██║ ║
║   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ║
║                                                           ║
║              Test de APIs Reales - MVP                    ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const results: Record<string, boolean | null> = {};

  // Test infraestructura
  results.redis = await testRedis();
  results.postgres = await testPostgres();

  // Test APIs externas
  results.mercadopago = await testMercadoPago();
  results.googleSheets = await testGoogleSheets();

  // Resumen
  section('RESUMEN');

  const icons: Record<string, string> = {
    true: `${colors.green}✓${colors.reset}`,
    false: `${colors.red}✗${colors.reset}`,
    null: `${colors.yellow}⊘${colors.reset}`,
  };

  console.log('  Redis:         ', icons[String(results.redis)]);
  console.log('  Postgres:      ', icons[String(results.postgres)]);
  console.log('  MercadoPago:   ', icons[String(results.mercadopago)]);
  console.log('  Google Sheets: ', icons[String(results.googleSheets)], results.googleSheets === null ? '(skipped)' : '');

  const allPassed = Object.values(results).every(r => r === true || r === null);

  if (allPassed) {
    console.log(`\n${colors.green}✓ Todo listo para usar IntegraX!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.yellow}⚠ Algunos tests fallaron. Revisá las credenciales.${colors.reset}\n`);
  }
}

main().catch(console.error);

#!/usr/bin/env npx tsx
/**
 * Script para simular un pago de prueba en MercadoPago Sandbox.
 *
 * Crea una preferencia de pago y abre el link para que puedas
 * pagar con una tarjeta de prueba.
 *
 * Uso:
 *   npx tsx scripts/simulate-payment.ts
 */

import { config } from 'dotenv';
config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║         SIMULADOR DE PAGO - MERCADOPAGO SANDBOX           ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    log('ERROR: MERCADOPAGO_ACCESS_TOKEN no configurado', colors.red);
    process.exit(1);
  }

  // 1. Crear preferencia de pago
  log('→ Creando preferencia de pago...', colors.cyan);

  const preference = {
    items: [
      {
        id: 'ITEM-001',
        title: 'Widget Premium - Test IntegraX',
        description: 'Producto de prueba para IntegraX',
        quantity: 2,
        currency_id: 'ARS',
        unit_price: 7500,
      },
    ],
    payer: {
      name: 'Test',
      surname: 'User',
      email: 'test_user_123456789@testuser.com',
    },
    external_reference: `INTEGRAX-TEST-${Date.now()}`,
    notification_url: 'https://webhook.site/test', // Placeholder
    back_urls: {
      success: 'https://integrax.local/success',
      failure: 'https://integrax.local/failure',
      pending: 'https://integrax.local/pending',
    },
    auto_return: 'approved',
  };

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) {
      const error = await response.json();
      log(`ERROR: ${JSON.stringify(error)}`, colors.red);
      process.exit(1);
    }

    const data = await response.json();

    log('✓ Preferencia creada!', colors.green);
    console.log('');
    log(`  ID: ${data.id}`, colors.reset);
    log(`  External Reference: ${preference.external_reference}`, colors.reset);
    log(`  Monto total: $${preference.items[0].unit_price * preference.items[0].quantity} ARS`, colors.reset);

    console.log('');
    log('═══════════════════════════════════════════════════════════', colors.cyan);
    log('  LINK DE PAGO (Sandbox):', colors.bold);
    log('═══════════════════════════════════════════════════════════', colors.cyan);
    console.log('');
    log(`  ${data.sandbox_init_point}`, colors.green);
    console.log('');

    log('═══════════════════════════════════════════════════════════', colors.cyan);
    log('  TARJETAS DE PRUEBA:', colors.bold);
    log('═══════════════════════════════════════════════════════════', colors.cyan);
    console.log('');
    log('  VISA (Aprobado):', colors.yellow);
    log('    Número: 4509 9535 6623 3704', colors.reset);
    log('    CVV: 123', colors.reset);
    log('    Vencimiento: 11/25', colors.reset);
    log('    Nombre: APRO', colors.reset);
    log('    DNI: 12345678', colors.reset);
    console.log('');
    log('  MASTERCARD (Aprobado):', colors.yellow);
    log('    Número: 5031 7557 3453 0604', colors.reset);
    log('    CVV: 123', colors.reset);
    log('    Vencimiento: 11/25', colors.reset);
    log('    Nombre: APRO', colors.reset);
    log('    DNI: 12345678', colors.reset);
    console.log('');
    log('  Para RECHAZAR el pago, usá nombre: OTHE', colors.yellow);
    console.log('');
    log('═══════════════════════════════════════════════════════════', colors.cyan);

    console.log('');
    log('Abrí el link en tu browser y completá el pago con la tarjeta de prueba.', colors.reset);
    log('Después ejecutá: pnpm test:real para ver el pago registrado.', colors.reset);
    console.log('');

  } catch (error) {
    log(`ERROR: ${error instanceof Error ? error.message : String(error)}`, colors.red);
    process.exit(1);
  }
}

main();

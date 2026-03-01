import { logger } from '../utils/logger.js';
/**
 * Payment Activities
 *
 * Activities for the payment processing workflow.
 * Each activity is an independent unit of work that can be retried.
 */

import { Pool } from 'pg';
import { Kafka } from 'kafkajs';

// Types
export interface ValidatePaymentInput {
  paymentId: string;
  tenantId: string;
}

export interface PaymentData {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payerEmail?: string;
  payerName?: string;
  paymentMethod: string;
  createdAt: string;
}

export interface PersistPaymentInput {
  paymentId: string;
  tenantId: string;
  correlationId: string;
  paymentData: PaymentData;
}

export interface PublishPaymentEventInput {
  paymentId: string;
  tenantId: string;
  correlationId: string;
  status: string;
  eventType: string;
}

export interface SyncToGoogleSheetsInput {
  paymentId: string;
  tenantId: string;
  paymentData: PaymentData;
}

export interface SendNotificationInput {
  tenantId: string;
  type: string;
  data: Record<string, unknown>;
}

// Database connection (lazy initialized)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.POSTGRES_HOST) throw new Error('POSTGRES_HOST is required');
    if (!process.env.POSTGRES_USER) throw new Error('POSTGRES_USER is required');
    if (!process.env.POSTGRES_PASSWORD) throw new Error('POSTGRES_PASSWORD is required');

    pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB || 'integrax',
    });
  }
  return pool;
}

// Kafka producer (lazy initialized)
let kafka: Kafka | null = null;

function getKafka(): Kafka {
  if (!kafka) {
    if (!process.env.KAFKA_BROKERS) throw new Error('KAFKA_BROKERS is required');
    kafka = new Kafka({
      clientId: 'integrax-temporal-worker',
      brokers: process.env.KAFKA_BROKERS.split(','),
    });
  }
  return kafka;
}

/**
 * Validate payment with MercadoPago API
 */
export async function validatePayment(input: ValidatePaymentInput): Promise<PaymentData> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${input.paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`MercadoPago API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json() as {
    id: number;
    status: string;
    transaction_amount: number;
    currency_id: string;
    payer?: { email?: string; first_name?: string };
    payment_method_id: string;
    date_created: string;
  };

  return {
    id: data.id.toString(),
    status: data.status,
    amount: data.transaction_amount,
    currency: data.currency_id,
    payerEmail: data.payer?.email,
    payerName: data.payer?.first_name,
    paymentMethod: data.payment_method_id,
    createdAt: data.date_created,
  };
}

/**
 * Persist payment to database
 */
export async function persistPayment(input: PersistPaymentInput): Promise<void> {
  const db = getPool();

  await db.query(
    `
    INSERT INTO payments (
      external_id, tenant_id, amount, currency, status,
      provider, provider_payment_id, payer_email, payer_name,
      metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (external_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()
    `,
    [
      input.paymentId,
      input.tenantId,
      input.paymentData.amount,
      input.paymentData.currency,
      input.paymentData.status,
      'mercadopago',
      input.paymentData.id,
      input.paymentData.payerEmail,
      input.paymentData.payerName,
      JSON.stringify({
        correlationId: input.correlationId,
        paymentMethod: input.paymentData.paymentMethod,
      }),
      input.paymentData.createdAt,
    ]
  );

  // Also insert into audit_logs
  await db.query(
    `
    INSERT INTO audit_logs (
      event_id, event_type, tenant_id, correlation_id, payload, status
    ) VALUES ($1, $2, $3, $4, $5, 'processed')
    `,
    [
      crypto.randomUUID(),
      `payment.${input.paymentData.status}`,
      input.tenantId,
      input.correlationId,
      JSON.stringify(input.paymentData),
    ]
  );
}

/**
 * Publish payment event to Kafka
 */
export async function publishPaymentEvent(input: PublishPaymentEventInput): Promise<void> {
  const kafka = getKafka();
  const producer = kafka.producer();

  await producer.connect();

  try {
    await producer.send({
      topic: 'integrax.payments',
      messages: [
        {
          key: input.paymentId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: input.eventType,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            timestamp: new Date().toISOString(),
            data: {
              paymentId: input.paymentId,
              status: input.status,
            },
          }),
          headers: {
            'correlation-id': input.correlationId,
            'tenant-id': input.tenantId,
          },
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
}

/**
 * Sync payment to Google Sheets
 */
export async function syncToGoogleSheets(input: SyncToGoogleSheetsInput): Promise<void> {
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!credentials || !spreadsheetId) {
    logger.info('Google Sheets not configured, skipping sync');
    return;
  }

  // Dynamic import for google-auth-library
  const { GoogleAuth } = await import('google-auth-library');

  const auth = new GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;

  if (!accessToken) {
    throw new Error('Failed to get Google access token');
  }

  // Append row to spreadsheet
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Pagos!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [
          [
            input.paymentData.id,
            input.paymentData.amount,
            input.paymentData.currency,
            input.paymentData.status,
            input.paymentData.payerEmail || '',
            new Date().toISOString(),
          ],
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google Sheets API error: ${JSON.stringify(error)}`);
  }
}

/**
 * Send notification to tenant
 */
export async function sendNotification(input: SendNotificationInput): Promise<void> {
  // For now, just log. In production, this would send via webhook, email, etc.
  logger.info(`[NOTIFICATION] Tenant: ${input.tenantId}, Type: ${input.type} Data: ${JSON.stringify(input.data)}`);

  // Could publish to a notifications topic in Kafka
  const kafka = getKafka();
  const producer = kafka.producer();

  await producer.connect();

  try {
    await producer.send({
      topic: 'integrax.notifications',
      messages: [
        {
          key: input.tenantId,
          value: JSON.stringify({
            tenantId: input.tenantId,
            type: input.type,
            data: input.data,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
}

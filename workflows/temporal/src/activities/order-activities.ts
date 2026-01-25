/**
 * Order Activities
 *
 * Activities for the order fulfillment workflow.
 */

import { Pool } from 'pg';
import { Kafka } from 'kafkajs';

// Types
export interface CreateOrderInput {
  orderId: string;
  tenantId: string;
  correlationId: string;
  customer: {
    email: string;
    name: string;
    taxId?: string;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
}

export interface ProcessPaymentInput {
  orderId: string;
  tenantId: string;
  amount: number;
  currency: string;
  method: string;
  customer: {
    email: string;
    name: string;
  };
}

export interface GenerateInvoiceInput {
  orderId: string;
  tenantId: string;
  correlationId: string;
  customer: {
    email: string;
    name: string;
    taxId?: string;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
}

export interface SendOrderConfirmationInput {
  orderId: string;
  tenantId: string;
  customer: {
    email: string;
    name: string;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
  invoiceId?: string;
  paymentId?: string;
}

export interface UpdateInventoryInput {
  tenantId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  action: 'increase' | 'decrease';
}

export interface PublishOrderEventInput {
  orderId: string;
  tenantId: string;
  correlationId: string;
  eventType: string;
  data: Record<string, unknown>;
}

// Database connection
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'integrax',
      password: process.env.POSTGRES_PASSWORD || 'integrax',
      database: process.env.POSTGRES_DB || 'integrax',
    });
  }
  return pool;
}

// Kafka
let kafka: Kafka | null = null;

function getKafka(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: 'integrax-temporal-worker',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
  }
  return kafka;
}

/**
 * Create order in database
 */
export async function createOrder(input: CreateOrderInput): Promise<{ orderId: string }> {
  const db = getPool();

  await db.query(
    `
    INSERT INTO orders (
      external_id, tenant_id, customer_email, customer_name,
      total_amount, currency, status, items, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
    ON CONFLICT (external_id) DO UPDATE SET
      status = 'pending',
      updated_at = NOW()
    `,
    [
      input.orderId,
      input.tenantId,
      input.customer.email,
      input.customer.name,
      input.totalAmount,
      input.currency,
      JSON.stringify(input.items),
      JSON.stringify({
        correlationId: input.correlationId,
        customerTaxId: input.customer.taxId,
      }),
    ]
  );

  return { orderId: input.orderId };
}

/**
 * Process payment for order
 */
export async function processPayment(
  input: ProcessPaymentInput
): Promise<{ paymentId: string; status: string }> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  }

  // Create MercadoPago preference
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          id: input.orderId,
          title: `Orden ${input.orderId}`,
          quantity: 1,
          currency_id: input.currency,
          unit_price: input.amount,
        },
      ],
      payer: {
        email: input.customer.email,
        name: input.customer.name,
      },
      external_reference: input.orderId,
      auto_return: 'approved',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`MercadoPago error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();

  // In a real scenario, we'd wait for the webhook. For now, return preference ID
  return {
    paymentId: data.id,
    status: 'pending',
  };
}

/**
 * Generate invoice for order
 */
export async function generateInvoice(
  input: GenerateInvoiceInput
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const db = getPool();

  // Generate invoice number (simple version)
  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  const invoiceId = crypto.randomUUID();

  // Get order ID from database
  const orderResult = await db.query(
    'SELECT id FROM orders WHERE external_id = $1',
    [input.orderId]
  );

  const orderId = orderResult.rows[0]?.id;

  await db.query(
    `
    INSERT INTO invoices (
      external_id, tenant_id, order_id, invoice_number,
      customer_email, customer_name, customer_tax_id,
      total_amount, tax_amount, currency, status, issued_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'issued', NOW(), $11)
    `,
    [
      invoiceId,
      input.tenantId,
      orderId,
      invoiceNumber,
      input.customer.email,
      input.customer.name,
      input.customer.taxId,
      input.totalAmount,
      Math.round(input.totalAmount * 0.21 * 100) / 100, // 21% IVA
      input.currency,
      JSON.stringify({
        correlationId: input.correlationId,
        items: input.items,
      }),
    ]
  );

  // In the future, this would call AFIP WSFE for electronic invoicing
  console.log(`[INVOICE] Generated invoice ${invoiceNumber} for order ${input.orderId}`);

  return {
    invoiceId,
    invoiceNumber,
  };
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmation(input: SendOrderConfirmationInput): Promise<void> {
  // Placeholder: In production, this would integrate with an email service
  console.log(`[EMAIL] Sending confirmation to ${input.customer.email}`);
  console.log(`  Order: ${input.orderId}`);
  console.log(`  Total: ${input.currency} ${input.totalAmount}`);
  console.log(`  Items: ${input.items.map(i => `${i.name} x${i.quantity}`).join(', ')}`);

  if (input.invoiceId) {
    console.log(`  Invoice: ${input.invoiceId}`);
  }

  // Publish notification event
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
            type: 'order_confirmation',
            tenantId: input.tenantId,
            to: input.customer.email,
            data: {
              orderId: input.orderId,
              customerName: input.customer.name,
              items: input.items,
              total: `${input.currency} ${input.totalAmount}`,
              invoiceId: input.invoiceId,
              paymentId: input.paymentId,
            },
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
}

/**
 * Update inventory
 */
export async function updateInventory(input: UpdateInventoryInput): Promise<void> {
  // Placeholder: In production, this would update an inventory service
  console.log(`[INVENTORY] Updating inventory for tenant ${input.tenantId}`);

  for (const item of input.items) {
    const delta = input.action === 'decrease' ? -item.quantity : item.quantity;
    console.log(`  Product ${item.productId}: ${delta > 0 ? '+' : ''}${delta}`);
  }

  // Publish inventory event
  const kafka = getKafka();
  const producer = kafka.producer();
  await producer.connect();

  try {
    await producer.send({
      topic: 'integrax.inventory',
      messages: [
        {
          key: input.tenantId,
          value: JSON.stringify({
            type: `inventory.${input.action}`,
            tenantId: input.tenantId,
            items: input.items,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
}

/**
 * Publish order event to Kafka
 */
export async function publishOrderEvent(input: PublishOrderEventInput): Promise<void> {
  const kafka = getKafka();
  const producer = kafka.producer();
  await producer.connect();

  try {
    await producer.send({
      topic: 'integrax.orders',
      messages: [
        {
          key: input.orderId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: input.eventType,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            timestamp: new Date().toISOString(),
            data: {
              orderId: input.orderId,
              ...input.data,
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

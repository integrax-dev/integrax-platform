import { createHmac } from 'crypto';
import type {
  WebhookPayload,
  NormalizedEvent,
  ExecutionContext,
} from '@integrax/connector-sdk';
import { MercadoPagoConnector } from './connector.js';
import type { WebhookEvent, Payment } from './types.js';

/**
 * Parse and normalize MercadoPago webhook payloads.
 */
export async function parseMercadoPagoWebhook(
  connector: MercadoPagoConnector,
  payload: WebhookPayload,
  context: Omit<ExecutionContext, 'correlationId'>,
  credentials: { accessToken: string }
): Promise<NormalizedEvent | null> {
  const body = payload.body as WebhookEvent;

  // Only process payment events
  if (body.type !== 'payment') {
    return null;
  }

  // Fetch the full payment details
  const paymentResult = await connector.executeAction<Payment>({
    actionId: 'get_payment',
    params: { paymentId: body.data.id },
    context: {
      ...context,
      correlationId: generateCorrelationId(),
    },
    credentials,
  });

  if (!paymentResult.success || !paymentResult.data) {
    throw new Error(`Failed to fetch payment: ${paymentResult.error?.message}`);
  }

  const payment = paymentResult.data;

  // Only emit event for approved payments
  if (payment.status !== 'approved') {
    return null;
  }

  return normalizePaymentToOrderPaid(payment, context.tenantId);
}

/**
 * Normalize a MercadoPago payment to the business.order.paid event format.
 */
export function normalizePaymentToOrderPaid(
  payment: Payment,
  tenantId: string
): NormalizedEvent {
  const eventId = generateEventId();
  const correlationId = payment.external_reference
    ? `mp-${payment.external_reference}`
    : `mp-${payment.id}`;

  // Calculate net amount (total - fees)
  const totalFees = payment.fee_details.reduce((sum, fee) => sum + fee.amount, 0);
  const netAmount = payment.transaction_amount - totalFees;

  // Map payment method
  const paymentMethod = mapPaymentMethod(payment.payment_type_id);

  // Build items from additional_info if available
  const items = payment.additional_info?.items?.map(item => ({
    id: item.id,
    sku: item.id,
    title: item.title,
    description: item.description ?? undefined,
    quantity: item.quantity,
    unit_price: item.unit_price,
  })) ?? [];

  // Build shipping from additional_info if available
  const shippingAddress = payment.additional_info?.shipments?.receiver_address;
  const shipping = shippingAddress ? {
    address: {
      street_name: shippingAddress.street_name ?? undefined,
      street_number: shippingAddress.street_number ?? undefined,
      city: shippingAddress.city_name ?? undefined,
      state: shippingAddress.state_name ?? undefined,
      zip_code: shippingAddress.zip_code ?? undefined,
      country: 'AR',
    },
    cost: 0,
  } : undefined;

  return {
    eventId,
    correlationId,
    tenantId,
    occurredAt: new Date(payment.date_approved ?? payment.date_created),
    eventType: 'business.order.paid',
    version: '1.0.0',
    source: 'mercadopago',
    payload: {
      order_id: `MP-${payment.id}`,
      external_reference: payment.external_reference,
      payment_id: String(payment.id),
      payment_method: paymentMethod,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      installments: payment.installments,
      fee_amount: totalFees,
      net_amount: netAmount,
      customer: {
        id: payment.payer.id ?? `mp-payer-${payment.id}`,
        email: payment.payer.email,
        first_name: payment.payer.first_name ?? payment.additional_info?.payer?.first_name,
        last_name: payment.payer.last_name ?? payment.additional_info?.payer?.last_name,
        phone: payment.payer.phone?.number
          ? `${payment.payer.phone.area_code ?? ''}${payment.payer.phone.number}`
          : undefined,
        identification: payment.payer.identification ? {
          type: payment.payer.identification.type,
          number: payment.payer.identification.number,
        } : undefined,
      },
      items,
      shipping,
      metadata: {
        mp_payment_id: payment.id,
        mp_status_detail: payment.status_detail,
        mp_payment_method_id: payment.payment_method_id,
        mp_issuer_id: payment.issuer_id,
        live_mode: payment.live_mode,
        ...(payment.metadata ?? {}),
      },
    },
  };
}

/**
 * Verify MercadoPago webhook signature.
 */
export function verifyMercadoPagoSignature(
  payload: WebhookPayload,
  secret: string
): boolean {
  const signature = payload.headers['x-signature'];
  const requestId = payload.headers['x-request-id'];

  if (!signature || !requestId) {
    return false;
  }

  // Parse signature header: ts=xxx,v1=xxx
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const ts = parts['ts'];
  const v1 = parts['v1'];

  if (!ts || !v1) {
    return false;
  }

  // Build the signed payload
  const body = payload.body as WebhookEvent;
  const dataId = body.data?.id ?? '';

  // Template: id:[data.id];request-id:[x-request-id];ts:[ts];
  const signedPayload = `id:${dataId};request-id:${requestId};ts:${ts};`;

  // Calculate HMAC
  const expectedSignature = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return expectedSignature === v1;
}

function mapPaymentMethod(paymentTypeId: string): string {
  const mapping: Record<string, string> = {
    credit_card: 'credit_card',
    debit_card: 'debit_card',
    account_money: 'account_money',
    bank_transfer: 'bank_transfer',
    ticket: 'cash',
    atm: 'cash',
  };

  return mapping[paymentTypeId] ?? 'other';
}

function generateEventId(): string {
  return crypto.randomUUID();
}

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

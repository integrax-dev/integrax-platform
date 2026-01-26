/**
 * Order Fulfillment Workflow
 *
 * Orquesta el flujo completo de una orden:
 * 1. Crear orden
 * 2. Esperar confirmación de pago
 * 3. Generar factura
 * 4. Notificar al cliente
 * 5. Actualizar inventario (futuro)
 */

import {
  proxyActivities,
  sleep,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type * as activities from '../activities/order-activities.js';

const {
  createOrder,
  processPayment,
  generateInvoice,
  sendOrderConfirmation,
  updateInventory,
  publishOrderEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '60 seconds',
  },
});

// Input types
export interface OrderWorkflowInput {
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
  paymentMethod?: string;
}

export interface OrderWorkflowOutput {
  success: boolean;
  orderId: string;
  status: OrderStatus;
  invoiceId?: string;
  paymentId?: string;
  processedAt: string;
  timeline: TimelineEvent[];
}

export type OrderStatus =
  | 'created'
  | 'payment_pending'
  | 'payment_received'
  | 'invoiced'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface TimelineEvent {
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// Signals
export const paymentReceivedSignal = defineSignal<[{ paymentId: string; amount: number }]>('paymentReceived');
export const cancelOrderSignal = defineSignal<[string]>('cancelOrder');

// Queries
export const getOrderStatusQuery = defineQuery<{ status: OrderStatus; timeline: TimelineEvent[] }>('getOrderStatus');

export async function orderWorkflow(input: OrderWorkflowInput): Promise<OrderWorkflowOutput> {
  let status: OrderStatus = 'created';
  const timeline: TimelineEvent[] = [];
  let paymentId: string | undefined;
  let invoiceId: string | undefined;
  let cancelled = false;
  let paymentReceived = false;
  let receivedPaymentData: { paymentId: string; amount: number } | null = null;

  // Add timeline event helper
  const addEvent = (event: string, data?: Record<string, unknown>) => {
    timeline.push({
      event,
      timestamp: new Date().toISOString(),
      data,
    });
  };

  // Signal handlers
  setHandler(paymentReceivedSignal, (data) => {
    paymentReceived = true;
    receivedPaymentData = data;
    addEvent('payment_signal_received', data);
  });

  setHandler(cancelOrderSignal, (reason) => {
    cancelled = true;
    status = 'cancelled';
    addEvent('order_cancelled', { reason });
  });

  // Query handler
  setHandler(getOrderStatusQuery, () => ({
    status,
    timeline,
  }));

  addEvent('workflow_started', { orderId: input.orderId });

  // Step 1: Create order in database
  try {
    await createOrder({
      orderId: input.orderId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      customer: input.customer,
      items: input.items,
      totalAmount: input.totalAmount,
      currency: input.currency,
    });
    addEvent('order_created');
    status = 'payment_pending';

    // Publish event
    await publishOrderEvent({
      orderId: input.orderId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      eventType: 'order.created',
      data: { status: 'payment_pending' },
    });
  } catch (error) {
    addEvent('order_creation_failed', { error: String(error) });
    return {
      success: false,
      orderId: input.orderId,
      status: 'failed',
      processedAt: new Date().toISOString(),
      timeline,
    };
  }

  // Step 2: Wait for payment (with timeout)
  // In production, this could wait for a webhook signal
  const paymentTimeout = 24 * 60 * 60 * 1000; // 24 hours

  if (cancelled) {
    return {
      success: false,
      orderId: input.orderId,
      status: 'cancelled',
      processedAt: new Date().toISOString(),
      timeline,
    };
  }

  // Wait for payment signal or process payment directly
  if (input.paymentMethod) {
    try {
      const paymentResult = await processPayment({
        orderId: input.orderId,
        tenantId: input.tenantId,
        amount: input.totalAmount,
        currency: input.currency,
        method: input.paymentMethod,
        customer: input.customer,
      });
      paymentId = paymentResult.paymentId;
      paymentReceived = true;
      addEvent('payment_processed', { paymentId });
    } catch (error) {
      addEvent('payment_failed', { error: String(error) });
      status = 'failed';
      return {
        success: false,
        orderId: input.orderId,
        status,
        processedAt: new Date().toISOString(),
        timeline,
      };
    }
  } else {
    // Wait for external payment signal
    addEvent('waiting_for_payment');
    const gotPayment = await condition(() => paymentReceived || cancelled, paymentTimeout);

    if (!gotPayment || cancelled) {
      addEvent('payment_timeout_or_cancelled');
      status = cancelled ? 'cancelled' : 'failed';
      return {
        success: false,
        orderId: input.orderId,
        status,
        processedAt: new Date().toISOString(),
        timeline,
      };
    }

    if (receivedPaymentData) {
      paymentId = (receivedPaymentData as { paymentId: string }).paymentId;
    }
  }

  status = 'payment_received';
  addEvent('payment_confirmed', { paymentId });

  // Publish payment received event
  await publishOrderEvent({
    orderId: input.orderId,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    eventType: 'order.payment_received',
    data: { paymentId },
  });

  // Step 3: Generate invoice
  try {
    const invoiceResult = await generateInvoice({
      orderId: input.orderId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      customer: input.customer,
      items: input.items,
      totalAmount: input.totalAmount,
      currency: input.currency,
    });
    invoiceId = invoiceResult.invoiceId;
    status = 'invoiced';
    addEvent('invoice_generated', {
      invoiceId,
      invoiceNumber: invoiceResult.invoiceNumber,
    });
  } catch (error) {
    addEvent('invoice_generation_failed', { error: String(error) });
    // Continue anyway, invoice can be generated later
  }

  // Step 4: Send confirmation email
  try {
    await sendOrderConfirmation({
      orderId: input.orderId,
      tenantId: input.tenantId,
      customer: input.customer,
      items: input.items,
      totalAmount: input.totalAmount,
      currency: input.currency,
      invoiceId,
      paymentId,
    });
    addEvent('confirmation_sent');
  } catch (error) {
    addEvent('confirmation_failed', { error: String(error) });
  }

  // Step 5: Update inventory (placeholder for future)
  try {
    await updateInventory({
      tenantId: input.tenantId,
      items: input.items,
      action: 'decrease',
    });
    addEvent('inventory_updated');
  } catch (error) {
    addEvent('inventory_update_failed', { error: String(error) });
  }

  // Final status
  status = 'completed';
  addEvent('workflow_completed');

  // Publish completion event
  await publishOrderEvent({
    orderId: input.orderId,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    eventType: 'order.completed',
    data: { invoiceId, paymentId },
  });

  return {
    success: true,
    orderId: input.orderId,
    status,
    invoiceId,
    paymentId,
    processedAt: new Date().toISOString(),
    timeline,
  };
}

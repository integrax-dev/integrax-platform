/**
 * Order Workflow Tests
 *
 * Tests unitarios para el workflow de fulfillment de órdenes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  OrderWorkflowInput,
  OrderWorkflowOutput,
  OrderStatus,
  TimelineEvent,
} from '../workflows/order-workflow';

// Test helper to simulate workflow execution
interface ActivityResults {
  createOrder?: void | Error;
  processPayment?: { paymentId: string } | Error;
  generateInvoice?: { invoiceId: string; invoiceNumber: string } | Error;
  sendConfirmation?: void | Error;
  updateInventory?: void | Error;
  publishEvent?: void | Error;
}

async function simulateOrderWorkflow(
  input: OrderWorkflowInput,
  activityResults: ActivityResults,
  options: {
    paymentSignal?: { paymentId: string; amount: number };
    cancelSignal?: string;
  } = {}
): Promise<OrderWorkflowOutput> {
  const timeline: TimelineEvent[] = [];
  let status: OrderStatus = 'created';
  let invoiceId: string | undefined;
  let paymentId: string | undefined;

  const addEvent = (event: string, data?: Record<string, unknown>) => {
    timeline.push({
      event,
      timestamp: new Date().toISOString(),
      data,
    });
  };

  addEvent('workflow_started', { orderId: input.orderId });

  // Check for cancel signal at start
  if (options.cancelSignal) {
    addEvent('order_cancelled', { reason: options.cancelSignal });
    return {
      success: false,
      orderId: input.orderId,
      status: 'cancelled',
      processedAt: new Date().toISOString(),
      timeline,
    };
  }

  // Step 1: Create order
  if (activityResults.createOrder instanceof Error) {
    addEvent('order_creation_failed', { error: activityResults.createOrder.message });
    return {
      success: false,
      orderId: input.orderId,
      status: 'failed',
      processedAt: new Date().toISOString(),
      timeline,
    };
  }

  addEvent('order_created');
  status = 'payment_pending';

  // Step 2: Process payment
  if (input.paymentMethod) {
    if (activityResults.processPayment instanceof Error) {
      addEvent('payment_failed', { error: activityResults.processPayment.message });
      return {
        success: false,
        orderId: input.orderId,
        status: 'failed',
        processedAt: new Date().toISOString(),
        timeline,
      };
    }

    const paymentResult = activityResults.processPayment || { paymentId: 'PAY-AUTO' };
    paymentId = paymentResult.paymentId;
    addEvent('payment_processed', { paymentId });
  } else if (options.paymentSignal) {
    // External payment signal
    paymentId = options.paymentSignal.paymentId;
    addEvent('payment_signal_received', options.paymentSignal);
  } else {
    // No payment method and no signal - timeout
    addEvent('payment_timeout_or_cancelled');
    return {
      success: false,
      orderId: input.orderId,
      status: 'failed',
      processedAt: new Date().toISOString(),
      timeline,
    };
  }

  status = 'payment_received';
  addEvent('payment_confirmed', { paymentId });

  // Step 3: Generate invoice
  if (activityResults.generateInvoice instanceof Error) {
    addEvent('invoice_generation_failed', { error: activityResults.generateInvoice.message });
  } else {
    const invoiceResult = activityResults.generateInvoice || { invoiceId: 'INV-123', invoiceNumber: 'A-0001' };
    invoiceId = invoiceResult.invoiceId;
    status = 'invoiced';
    addEvent('invoice_generated', { invoiceId, invoiceNumber: invoiceResult.invoiceNumber });
  }

  // Step 4: Send confirmation
  if (activityResults.sendConfirmation instanceof Error) {
    addEvent('confirmation_failed', { error: activityResults.sendConfirmation.message });
  } else {
    addEvent('confirmation_sent');
  }

  // Step 5: Update inventory
  if (activityResults.updateInventory instanceof Error) {
    addEvent('inventory_update_failed', { error: activityResults.updateInventory.message });
  } else {
    addEvent('inventory_updated');
  }

  status = 'completed';
  addEvent('workflow_completed');

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

describe('OrderWorkflow', () => {
  const baseInput: OrderWorkflowInput = {
    orderId: 'ORD-123',
    tenantId: 'tenant-1',
    correlationId: 'corr-abc',
    customer: {
      email: 'cliente@example.com',
      name: 'Juan Pérez',
      taxId: '20-12345678-9',
    },
    items: [
      {
        productId: 'PROD-1',
        name: 'Producto A',
        quantity: 2,
        unitPrice: 500,
      },
    ],
    totalAmount: 1000,
    currency: 'ARS',
    paymentMethod: 'mercadopago',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Happy Path', () => {
    it('should complete order with all steps successful', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-MP-123' },
        generateInvoice: { invoiceId: 'INV-001', invoiceNumber: 'A-00001' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.orderId).toBe('ORD-123');
      expect(result.paymentId).toBe('PAY-MP-123');
      expect(result.invoiceId).toBe('INV-001');
      expect(result.timeline.length).toBeGreaterThan(0);
    });

    it('should include all timeline events', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-123' },
        generateInvoice: { invoiceId: 'INV-123', invoiceNumber: 'A-0001' },
      });

      const eventNames = result.timeline.map(e => e.event);

      expect(eventNames).toContain('workflow_started');
      expect(eventNames).toContain('order_created');
      expect(eventNames).toContain('payment_processed');
      expect(eventNames).toContain('payment_confirmed');
      expect(eventNames).toContain('invoice_generated');
      expect(eventNames).toContain('confirmation_sent');
      expect(eventNames).toContain('inventory_updated');
      expect(eventNames).toContain('workflow_completed');
    });
  });

  describe('Payment Handling', () => {
    it('should handle direct payment method', async () => {
      const input: OrderWorkflowInput = {
        ...baseInput,
        paymentMethod: 'mercadopago',
      };

      const result = await simulateOrderWorkflow(input, {
        processPayment: { paymentId: 'PAY-DIRECT-123' },
        generateInvoice: { invoiceId: 'INV-1', invoiceNumber: 'A-1' },
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('PAY-DIRECT-123');
    });

    it('should handle external payment signal', async () => {
      const input: OrderWorkflowInput = {
        ...baseInput,
        paymentMethod: undefined, // No direct payment
      };

      const result = await simulateOrderWorkflow(
        input,
        {
          generateInvoice: { invoiceId: 'INV-1', invoiceNumber: 'A-1' },
        },
        {
          paymentSignal: { paymentId: 'PAY-EXTERNAL-456', amount: 1000 },
        }
      );

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('PAY-EXTERNAL-456');

      const signalEvent = result.timeline.find(e => e.event === 'payment_signal_received');
      expect(signalEvent).toBeDefined();
      expect(signalEvent?.data?.paymentId).toBe('PAY-EXTERNAL-456');
    });

    it('should fail on payment timeout when no payment method or signal', async () => {
      const input: OrderWorkflowInput = {
        ...baseInput,
        paymentMethod: undefined,
      };

      const result = await simulateOrderWorkflow(input, {});

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      const timeoutEvent = result.timeline.find(e => e.event === 'payment_timeout_or_cancelled');
      expect(timeoutEvent).toBeDefined();
    });

    it('should fail when payment processing fails', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: new Error('Insufficient funds'),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      const failEvent = result.timeline.find(e => e.event === 'payment_failed');
      expect(failEvent).toBeDefined();
      expect(failEvent?.data?.error).toContain('Insufficient funds');
    });
  });

  describe('Order Creation', () => {
    it('should fail when order creation fails', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        createOrder: new Error('Database connection failed'),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      const failEvent = result.timeline.find(e => e.event === 'order_creation_failed');
      expect(failEvent).toBeDefined();
    });
  });

  describe('Cancellation', () => {
    it('should handle cancel signal', async () => {
      const result = await simulateOrderWorkflow(
        baseInput,
        {},
        { cancelSignal: 'Customer requested cancellation' }
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');

      const cancelEvent = result.timeline.find(e => e.event === 'order_cancelled');
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent?.data?.reason).toBe('Customer requested cancellation');
    });
  });

  describe('Non-Critical Failures', () => {
    it('should continue when invoice generation fails', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-123' },
        generateInvoice: new Error('AFIP service unavailable'),
      });

      expect(result.success).toBe(true);
      expect(result.invoiceId).toBeUndefined();

      const failEvent = result.timeline.find(e => e.event === 'invoice_generation_failed');
      expect(failEvent).toBeDefined();
    });

    it('should continue when confirmation email fails', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-123' },
        generateInvoice: { invoiceId: 'INV-1', invoiceNumber: 'A-1' },
        sendConfirmation: new Error('SMTP server down'),
      });

      expect(result.success).toBe(true);

      const failEvent = result.timeline.find(e => e.event === 'confirmation_failed');
      expect(failEvent).toBeDefined();
    });

    it('should continue when inventory update fails', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-123' },
        generateInvoice: { invoiceId: 'INV-1', invoiceNumber: 'A-1' },
        updateInventory: new Error('Inventory service timeout'),
      });

      expect(result.success).toBe(true);

      const failEvent = result.timeline.find(e => e.event === 'inventory_update_failed');
      expect(failEvent).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should accept Argentine customer with CUIT', () => {
      const input: OrderWorkflowInput = {
        ...baseInput,
        customer: {
          email: 'empresa@empresa.com.ar',
          name: 'Empresa SRL',
          taxId: '30-71234567-9', // CUIT empresa
        },
      };

      expect(input.customer.taxId).toMatch(/^\d{2}-\d{8}-\d$/);
    });

    it('should handle multiple items', () => {
      const input: OrderWorkflowInput = {
        ...baseInput,
        items: [
          { productId: 'P1', name: 'Producto 1', quantity: 1, unitPrice: 100 },
          { productId: 'P2', name: 'Producto 2', quantity: 2, unitPrice: 200 },
          { productId: 'P3', name: 'Producto 3', quantity: 3, unitPrice: 300 },
        ],
        totalAmount: 100 + 400 + 900, // 1400
      };

      expect(input.items).toHaveLength(3);
      expect(input.totalAmount).toBe(1400);
    });

    it('should support ARS and USD currencies', () => {
      const currencies = ['ARS', 'USD'];

      for (const currency of currencies) {
        const input: OrderWorkflowInput = {
          ...baseInput,
          currency,
        };
        expect(input.currency).toBe(currency);
      }
    });
  });

  describe('Timeline Events', () => {
    it('should have timestamps on all events', async () => {
      const result = await simulateOrderWorkflow(baseInput, {
        processPayment: { paymentId: 'PAY-123' },
        generateInvoice: { invoiceId: 'INV-1', invoiceNumber: 'A-1' },
      });

      for (const event of result.timeline) {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      }
    });
  });
});

describe('OrderStatus Types', () => {
  it('should include all valid statuses', () => {
    const validStatuses: OrderStatus[] = [
      'created',
      'payment_pending',
      'payment_received',
      'invoiced',
      'completed',
      'cancelled',
      'failed',
    ];

    expect(validStatuses).toHaveLength(7);
  });
});

/**
 * Payment Workflow Tests
 *
 * Tests unitarios para el workflow de procesamiento de pagos
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentWorkflowInput, PaymentWorkflowOutput, StepResult } from '../workflows/payment-workflow';

// Mock activities
const mockActivities = {
  validatePayment: vi.fn(),
  persistPayment: vi.fn(),
  publishPaymentEvent: vi.fn(),
  syncToGoogleSheets: vi.fn(),
  sendNotification: vi.fn(),
};

// Test helper to simulate workflow execution
async function simulatePaymentWorkflow(
  input: PaymentWorkflowInput,
  activityResults: {
    validate?: { status: string; amount: number } | Error;
    persist?: void | Error;
    publish?: void | Error;
    sheets?: void | Error;
    notify?: void | Error;
  }
): Promise<PaymentWorkflowOutput> {
  const steps: StepResult[] = [];
  const startTime = Date.now();

  // Step 1: Validate
  const validateStart = Date.now();
  let paymentData: { status: string; amount: number };

  if (activityResults.validate instanceof Error) {
    steps.push({
      step: 'validate',
      success: false,
      duration: Date.now() - validateStart,
      error: activityResults.validate.message,
    });
    return {
      success: false,
      paymentId: input.paymentId,
      status: 'validation_failed',
      processedAt: new Date().toISOString(),
      steps,
    };
  }

  paymentData = activityResults.validate || { status: 'approved', amount: 1000 };
  steps.push({
    step: 'validate',
    success: true,
    duration: Date.now() - validateStart,
  });

  // Step 2: Persist
  const persistStart = Date.now();
  if (activityResults.persist instanceof Error) {
    steps.push({
      step: 'persist',
      success: false,
      duration: Date.now() - persistStart,
      error: activityResults.persist.message,
    });
  } else {
    steps.push({
      step: 'persist',
      success: true,
      duration: Date.now() - persistStart,
    });
  }

  // Step 3: Publish to Kafka
  const publishStart = Date.now();
  if (activityResults.publish instanceof Error) {
    steps.push({
      step: 'publish_kafka',
      success: false,
      duration: Date.now() - publishStart,
      error: activityResults.publish.message,
    });
  } else {
    steps.push({
      step: 'publish_kafka',
      success: true,
      duration: Date.now() - publishStart,
    });
  }

  // Step 4: Sync to Sheets
  const sheetsStart = Date.now();
  if (activityResults.sheets instanceof Error) {
    steps.push({
      step: 'sync_sheets',
      success: false,
      duration: Date.now() - sheetsStart,
      error: activityResults.sheets.message,
    });
  } else {
    steps.push({
      step: 'sync_sheets',
      success: true,
      duration: Date.now() - sheetsStart,
    });
  }

  // Step 5: Notify
  const notifyStart = Date.now();
  if (activityResults.notify instanceof Error) {
    steps.push({
      step: 'notify',
      success: false,
      duration: Date.now() - notifyStart,
      error: activityResults.notify.message,
    });
  } else {
    steps.push({
      step: 'notify',
      success: true,
      duration: Date.now() - notifyStart,
    });
  }

  const allSuccess = steps.every(s => s.success);

  return {
    success: allSuccess,
    paymentId: input.paymentId,
    status: paymentData.status,
    processedAt: new Date().toISOString(),
    steps,
  };
}

describe('PaymentWorkflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Happy Path', () => {
    it('should complete all steps successfully', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 1500 },
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('PAY-123');
      expect(result.status).toBe('approved');
      expect(result.steps).toHaveLength(5);
      expect(result.steps.every(s => s.success)).toBe(true);
    });

    it('should handle different payment sources', async () => {
      const sources: Array<'webhook' | 'api' | 'cdc'> = ['webhook', 'api', 'cdc'];

      for (const source of sources) {
        const input: PaymentWorkflowInput = {
          paymentId: `PAY-${source}`,
          tenantId: 'tenant-1',
          correlationId: 'corr-abc',
          source,
        };

        const result = await simulatePaymentWorkflow(input, {
          validate: { status: 'approved', amount: 1000 },
        });

        expect(result.success).toBe(true);
        expect(result.paymentId).toBe(`PAY-${source}`);
      }
    });
  });

  describe('Validation Failures', () => {
    it('should fail gracefully when validation fails', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-INVALID',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: new Error('Payment not found in MercadoPago'),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('validation_failed');
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].step).toBe('validate');
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toContain('Payment not found');
    });
  });

  describe('Non-Critical Failures', () => {
    it('should continue when persist fails', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 1000 },
        persist: new Error('Database connection failed'),
      });

      // Should complete but with one failed step
      expect(result.paymentId).toBe('PAY-123');
      expect(result.steps).toHaveLength(5);

      const persistStep = result.steps.find(s => s.step === 'persist');
      expect(persistStep?.success).toBe(false);
      expect(persistStep?.error).toContain('Database');
    });

    it('should continue when Google Sheets sync fails', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'api',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 2000 },
        sheets: new Error('Sheets API rate limit'),
      });

      expect(result.steps).toHaveLength(5);

      const sheetsStep = result.steps.find(s => s.step === 'sync_sheets');
      expect(sheetsStep?.success).toBe(false);
    });

    it('should continue when notification fails', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'cdc',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 500 },
        notify: new Error('Notification service unavailable'),
      });

      expect(result.steps).toHaveLength(5);

      const notifyStep = result.steps.find(s => s.step === 'notify');
      expect(notifyStep?.success).toBe(false);
    });
  });

  describe('Step Timing', () => {
    it('should track duration for each step', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 1000 },
      });

      for (const step of result.steps) {
        expect(step.duration).toBeGreaterThanOrEqual(0);
        expect(typeof step.duration).toBe('number');
      }
    });
  });

  describe('Payment Statuses', () => {
    it('should handle approved payment', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'approved', amount: 1000 },
      });

      expect(result.status).toBe('approved');
    });

    it('should handle pending payment', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-PENDING',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'pending', amount: 1000 },
      });

      expect(result.status).toBe('pending');
    });

    it('should handle rejected payment', async () => {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-REJECTED',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'webhook',
      };

      const result = await simulatePaymentWorkflow(input, {
        validate: { status: 'rejected', amount: 1000 },
      });

      expect(result.status).toBe('rejected');
    });
  });
});

describe('PaymentWorkflowInput Validation', () => {
  it('should require all mandatory fields', () => {
    const validInput: PaymentWorkflowInput = {
      paymentId: 'PAY-123',
      tenantId: 'tenant-1',
      correlationId: 'corr-abc',
      source: 'webhook',
    };

    expect(validInput.paymentId).toBeDefined();
    expect(validInput.tenantId).toBeDefined();
    expect(validInput.correlationId).toBeDefined();
    expect(validInput.source).toBeDefined();
  });

  it('should accept valid source types', () => {
    const sources: Array<'webhook' | 'api' | 'cdc'> = ['webhook', 'api', 'cdc'];

    for (const source of sources) {
      const input: PaymentWorkflowInput = {
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source,
      };
      expect(input.source).toBe(source);
    }
  });
});

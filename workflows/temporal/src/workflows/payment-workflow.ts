import { createLogger } from '../../../../workers/ts/src/logger.js';
const logger = createLogger('payment-workflow');
/**
 * Payment Processing Workflow
 *
 * Orquesta el flujo completo de un pago:
 * 1. Validar pago en MercadoPago
 * 2. Registrar en base de datos
 * 3. Publicar evento a Kafka
 * 4. Sincronizar con Google Sheets (opcional)
 * 5. Notificar al tenant
 */

import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities/payment-activities.js';

// Activity proxies with retry options
const {
  validatePayment,
  persistPayment,
  publishPaymentEvent,
  syncToGoogleSheets,
  sendNotification
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
  },
});

// Workflow input type
export interface PaymentWorkflowInput {
  paymentId: string;
  tenantId: string;
  correlationId: string;
  source: 'webhook' | 'api' | 'cdc';
}

// Workflow output type
export interface PaymentWorkflowOutput {
  success: boolean;
  paymentId: string;
  status: string;
  processedAt: string;
  steps: StepResult[];
}

export interface StepResult {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
}

// Signals for external control
export const cancelPaymentSignal = defineSignal<[string]>('cancelPayment');
export const retryStepSignal = defineSignal<[string]>('retryStep');

export async function paymentWorkflow(input: PaymentWorkflowInput): Promise<PaymentWorkflowOutput> {
  const startTime = Date.now();
  const steps: StepResult[] = [];
  let cancelled = false;
  let retryStep: string | null = null;

  // Set up signal handlers
  setHandler(cancelPaymentSignal, (reason: string) => {
    cancelled = true;
    logger.info(`Payment ${input.paymentId} cancelled: ${reason}`);
  });

  setHandler(retryStepSignal, (step: string) => {
    retryStep = step;
    logger.info(`Retrying step: ${step}`);
  });

  // Check for cancellation
  if (cancelled) {
    return {
      success: false,
      paymentId: input.paymentId,
      status: 'cancelled',
      processedAt: new Date().toISOString(),
      steps,
    };
  }

  // Step 1: Validate payment with MercadoPago
  const validateStart = Date.now();
  let paymentData;
  try {
    paymentData = await validatePayment({
      paymentId: input.paymentId,
      tenantId: input.tenantId,
    });
    steps.push({
      step: 'validate',
      success: true,
      duration: Date.now() - validateStart,
    });
  } catch (error) {
    steps.push({
      step: 'validate',
      success: false,
      duration: Date.now() - validateStart,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      paymentId: input.paymentId,
      status: 'validation_failed',
      processedAt: new Date().toISOString(),
      steps,
    };
  }

  // Step 2: Persist to database
  const persistStart = Date.now();
  try {
    await persistPayment({
      paymentId: input.paymentId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      paymentData,
    });
    steps.push({
      step: 'persist',
      success: true,
      duration: Date.now() - persistStart,
    });
  } catch (error) {
    steps.push({
      step: 'persist',
      success: false,
      duration: Date.now() - persistStart,
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue anyway, we can retry later
  }

  // Step 3: Publish event to Kafka
  const publishStart = Date.now();
  try {
    await publishPaymentEvent({
      paymentId: input.paymentId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      status: paymentData.status,
      eventType: `payment.${paymentData.status}`,
    });
    steps.push({
      step: 'publish_kafka',
      success: true,
      duration: Date.now() - publishStart,
    });
  } catch (error) {
    steps.push({
      step: 'publish_kafka',
      success: false,
      duration: Date.now() - publishStart,
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-critical, continue
  }

  // Step 4: Sync to Google Sheets (optional, non-blocking)
  const sheetsStart = Date.now();
  try {
    await syncToGoogleSheets({
      paymentId: input.paymentId,
      tenantId: input.tenantId,
      paymentData,
    });
    steps.push({
      step: 'sync_sheets',
      success: true,
      duration: Date.now() - sheetsStart,
    });
  } catch (error) {
    steps.push({
      step: 'sync_sheets',
      success: false,
      duration: Date.now() - sheetsStart,
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-critical, continue
  }

  // Step 5: Send notification
  const notifyStart = Date.now();
  try {
    await sendNotification({
      tenantId: input.tenantId,
      type: 'payment_processed',
      data: {
        paymentId: input.paymentId,
        status: paymentData.status,
        amount: paymentData.amount,
      },
    });
    steps.push({
      step: 'notify',
      success: true,
      duration: Date.now() - notifyStart,
    });
  } catch (error) {
    steps.push({
      step: 'notify',
      success: false,
      duration: Date.now() - notifyStart,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    success: steps.filter(s => !s.success).length === 0,
    paymentId: input.paymentId,
    status: paymentData.status,
    processedAt: new Date().toISOString(),
    steps,
  };
}

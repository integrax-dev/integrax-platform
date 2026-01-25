import type { Job } from 'bullmq';
import type { TaskPayload, TaskResult } from '../worker.js';
import type { AuditLogger } from '../audit.js';
import { createLogger } from '../logger.js';
import { GoogleSheetsConnector } from '@integrax/connector-google-sheets';

const logger = createLogger('handler:order-paid');

// Placeholder for credential management - in production use Vault/secrets manager
const getCredentials = async (tenantId: string, connectorId: string) => {
  // TODO: Implement proper secret management
  return {
    accessToken: process.env[`${connectorId.toUpperCase()}_ACCESS_TOKEN`] ?? '',
  };
};

export async function processOrderPaid(
  job: Job<TaskPayload>,
  audit: AuditLogger
): Promise<TaskResult> {
  const { payload, correlationId, tenantId, eventId } = job.data;
  const orderPayload = payload as OrderPaidPayload;

  logger.info({
    orderId: orderPayload.order_id,
    correlationId,
  }, 'Processing order paid event');

  // 1. Log to Google Sheets (if configured)
  const sheetsSpreadsheetId = process.env.SHEETS_SPREADSHEET_ID;

  if (sheetsSpreadsheetId) {
    try {
      const sheetsConnector = new GoogleSheetsConnector();
      const credentials = await getCredentials(tenantId, 'google-sheets');

      const result = await sheetsConnector.executeAction({
        actionId: 'append_rows',
        params: {
          spreadsheetId: sheetsSpreadsheetId,
          range: 'Ventas!A:H',
          values: [[
            new Date().toISOString(),
            orderPayload.order_id,
            orderPayload.payment_id,
            orderPayload.customer?.email ?? '',
            orderPayload.amount,
            orderPayload.currency,
            orderPayload.payment_method ?? '',
            JSON.stringify(orderPayload.items ?? []),
          ]],
        },
        context: {
          correlationId,
          tenantId,
        },
        credentials,
      });

      if (!result.success) {
        logger.warn({
          orderId: orderPayload.order_id,
          error: result.error,
        }, 'Failed to append to Google Sheets');
      } else {
        logger.info({
          orderId: orderPayload.order_id,
        }, 'Order logged to Google Sheets');
      }
    } catch (error) {
      logger.warn({
        orderId: orderPayload.order_id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Google Sheets integration error (non-fatal)');
    }
  }

  // 2. Here you would trigger the next step in the workflow:
  // - Create customer in ERP
  // - Create invoice draft
  // - Request CAE from AFIP (if applicable)
  // - Send notifications
  //
  // For MVP, we just log and return success

  logger.info({
    orderId: orderPayload.order_id,
    correlationId,
  }, 'Order paid event processed successfully');

  return {
    success: true,
    data: {
      orderId: orderPayload.order_id,
      processedAt: new Date().toISOString(),
    },
  };
}

interface OrderPaidPayload {
  order_id: string;
  external_reference?: string;
  payment_id: string;
  payment_method?: string;
  amount: number;
  currency: string;
  installments?: number;
  fee_amount?: number;
  net_amount?: number;
  customer?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  items?: Array<{
    id: string;
    sku?: string;
    title: string;
    quantity: number;
    unit_price: number;
  }>;
  shipping?: {
    address?: {
      street_name?: string;
      street_number?: string;
      city?: string;
      state?: string;
      zip_code?: string;
      country?: string;
    };
    cost?: number;
  };
  metadata?: Record<string, unknown>;
}

import type { Job } from 'bullmq';
import type { TaskPayload, TaskResult } from '../worker.js';
import type { AuditLogger } from '../audit.js';
import { createLogger } from '../logger.js';
import { GoogleSheetsConnector } from '@integrax/connector-google-sheets';

const logger = createLogger('handler:invoice-issued');

const getCredentials = async (tenantId: string, connectorId: string) => {
  return {
    accessToken: process.env[`${connectorId.toUpperCase()}_ACCESS_TOKEN`] ?? '',
  };
};

export async function processInvoiceIssued(
  job: Job<TaskPayload>,
  audit: AuditLogger
): Promise<TaskResult> {
  const { payload, correlationId, tenantId } = job.data;
  const invoicePayload = payload as InvoiceIssuedPayload;

  logger.info({
    invoiceId: invoicePayload.invoice_id,
    invoiceNumber: invoicePayload.invoice_number,
    correlationId,
  }, 'Processing invoice issued event');

  // 1. Log to Google Sheets
  const sheetsSpreadsheetId = process.env.SHEETS_SPREADSHEET_ID;

  if (sheetsSpreadsheetId) {
    try {
      const sheetsConnector = new GoogleSheetsConnector();
      const credentials = await getCredentials(tenantId, 'google-sheets');

      const result = await sheetsConnector.executeAction({
        actionId: 'append_rows',
        params: {
          spreadsheetId: sheetsSpreadsheetId,
          range: 'Facturas!A:J',
          values: [[
            new Date().toISOString(),
            invoicePayload.invoice_number,
            invoicePayload.invoice_type,
            invoicePayload.invoice_date,
            invoicePayload.customer?.name ?? '',
            invoicePayload.customer?.identification?.number ?? '',
            invoicePayload.total_amount,
            invoicePayload.currency,
            invoicePayload.afip?.cae ?? '',
            invoicePayload.related_order_id ?? '',
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
          invoiceId: invoicePayload.invoice_id,
          error: result.error,
        }, 'Failed to append invoice to Google Sheets');
      } else {
        logger.info({
          invoiceId: invoicePayload.invoice_id,
        }, 'Invoice logged to Google Sheets');
      }
    } catch (error) {
      logger.warn({
        invoiceId: invoicePayload.invoice_id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Google Sheets integration error (non-fatal)');
    }
  }

  // 2. Here you would:
  // - Send notification to customer (email/WhatsApp)
  // - Update order status in ecommerce
  // - Any other post-invoice actions

  logger.info({
    invoiceId: invoicePayload.invoice_id,
    invoiceNumber: invoicePayload.invoice_number,
    correlationId,
  }, 'Invoice issued event processed successfully');

  return {
    success: true,
    data: {
      invoiceId: invoicePayload.invoice_id,
      invoiceNumber: invoicePayload.invoice_number,
      processedAt: new Date().toISOString(),
    },
  };
}

interface InvoiceIssuedPayload {
  invoice_id: string;
  invoice_number: string;
  invoice_type: string;
  invoice_date: string;
  due_date?: string;
  related_order_id?: string;
  related_payment_id?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  customer?: {
    id?: string;
    name: string;
    email?: string;
    identification?: {
      type: string;
      number: string;
    };
    tax_category?: string;
  };
  issuer?: {
    cuit: string;
    business_name: string;
    point_of_sale: number;
  };
  items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
    subtotal?: number;
  }>;
  afip?: {
    cae?: string;
    cae_expiration?: string;
  };
  pdf_url?: string;
  metadata?: Record<string, unknown>;
}

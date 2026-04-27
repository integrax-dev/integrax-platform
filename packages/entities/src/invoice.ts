import type { ExternalId } from './external-id.js';

export type InvoiceStatus =
  | 'draft'
  | 'authorized'
  | 'voided'
  | 'pending'
  | 'rejected';

export interface Invoice {
  id?: string;
  externalIds: ExternalId[];
  invoiceNumber?: string;
  /** Raw numeric document type — kept connector-agnostic; country packs interpret the value. */
  invoiceType?: number;
  customerTaxId?: string;
  customerName?: string;
  amountNet?: number;
  amountTax?: number;
  amountTotal: number;
  currency: string;
  /** Fiscal authorization code issued by the tax authority (e.g. CAE, CFDI UUID, NF-e chave). */
  authorizationCode?: string;
  authorizationExpiry?: Date;
  status: InvoiceStatus;
  issuedAt?: Date;
  dueAt?: Date;
  sourceSystem: string;
  updatedAt: Date;
}

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
  /** Por ejemplo '0001-00000042'. */
  invoiceNumber?: string;
  /** Tipo numerico de comprobante, mantenido como valor crudo agnostico al pais. */
  invoiceType?: number;
  customerTaxId?: string;
  customerName?: string;
  amountNet?: number;
  amountTax?: number;
  amountTotal: number;
  currency: string;
  /** Especifico de AR: Codigo de Autorizacion Electronica, guardado como string generico. */
  cae?: string;
  caeExpiryDate?: Date;
  status: InvoiceStatus;
  issuedAt?: Date;
  dueAt?: Date;
  sourceSystem: string;
  updatedAt: Date;
}

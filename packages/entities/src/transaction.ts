import type { ExternalId } from './external-id.js';

export type TransactionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'refunded'
  | 'cancelled'
  | 'in_process';

export type TransactionType =
  | 'payment'
  | 'refund'
  | 'chargeback'
  | 'adjustment';

export interface Transaction {
  id?: string;
  externalIds: ExternalId[];
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  /** Referencia a un pedido, factura o documento externo. */
  referenceId?: string;
  referenceType?: string;
  paymentMethod?: string;
  processedAt?: Date;
  sourceSystem: string;
  updatedAt: Date;
}

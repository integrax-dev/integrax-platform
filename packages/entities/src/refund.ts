import type { ExternalId } from './external-id.js';

export type RefundStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type RefundReason =
  | 'duplicate'
  | 'fraudulent'
  | 'customer_request'
  | 'product_not_received'
  | 'product_unacceptable'
  | 'subscription_cancelled'
  | 'other';

/**
 * Canonical Refund entity.
 *
 * Represents a refund against a previously captured payment.
 * A payment may have multiple partial refunds.
 */
export interface Refund {
  canonicalId?: string;
  externalIds: ExternalId[];

  /** Canonical ID of the original payment. */
  paymentId: string;
  provider: string;

  amount: number;
  currency: string;
  status: RefundStatus;
  reason?: RefundReason;
  /** Free-text note for the payer. */
  note?: string;

  /** Who initiated the refund (canonical actor ID). */
  initiatedBy?: string;

  processedAt?: Date;
  rejectionReason?: string;

  sourceSystem: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

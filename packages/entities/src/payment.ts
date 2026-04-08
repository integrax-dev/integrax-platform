import type { ExternalId } from './external-id.js';

/**
 * Lifecycle status of a payment.
 *
 * Designed to be provider-neutral. PSP-specific sub-states should be captured
 * in the `metadata` field or a provider-specific extension, not here.
 */
export type PaymentStatus =
  | 'pending'          // created but not yet processed
  | 'authorized'       // funds held, not yet captured
  | 'captured'         // funds confirmed
  | 'approved'         // generic approved (covers PSPs that don't split auth/capture)
  | 'in_process'       // processing by the PSP
  | 'rejected'         // declined by PSP or issuer
  | 'cancelled'        // voided before capture
  | 'refunded'         // fully refunded
  | 'partially_refunded'
  | 'chargeback'       // disputed by cardholder
  | 'expired';

/**
 * High-level payment method type. Provider-specific variants live in PaymentMethod.
 */
export type PaymentMethodType =
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'digital_wallet'   // e.g. MercadoPago wallet, PayPal balance
  | 'qr_code'
  | 'cash'             // e.g. Rapipago, PagoFácil, 7-Eleven
  | 'bnpl'             // buy-now-pay-later
  | 'crypto'
  | 'voucher'
  | 'other';

/**
 * Canonical Payment entity.
 *
 * Represents a single payment transaction observed across any PSP.
 * Provider-specific fields (e.g. MercadoPago's `payment_type_id`, Stripe's
 * `charge_id`) live in `externalIds` or `metadata`.
 *
 * Amounts are always in the smallest unit of the currency (e.g. centavos for ARS,
 * cents for USD) when the PSP uses them, OR as a decimal value — callers must
 * document their convention via `currency` ISO code and `metadata.amountUnit`.
 */
export interface Payment {
  /** Platform-assigned canonical ID (ULID). */
  canonicalId?: string;
  /** All known external IDs across PSPs and internal systems. */
  externalIds: ExternalId[];

  /** PSP that owns this payment record (e.g. 'mercadopago', 'stripe'). */
  provider: string;
  /** Provider account / merchant ID within the PSP. */
  providerAccountId?: string;

  /** Gross amount charged (in currency units, decimal). */
  amount: number;
  /** Net amount after PSP fees, if known. */
  netAmount?: number;
  /** ISO 4217 currency code (e.g. 'ARS', 'USD'). */
  currency: string;

  status: PaymentStatus;
  methodType: PaymentMethodType;

  /** Number of installments (cuotas). 1 = single payment. */
  installments?: number;
  /** Provider-specific installment plan identifier. */
  installmentPlanId?: string;

  /** Canonical ID of the payer (Customer). */
  payerId?: string;
  /** Canonical ID of the payee (Tenant / Merchant). */
  payeeId?: string;

  /** Link to the originating order canonical ID. */
  orderId?: string;
  /** Link to the originating invoice canonical ID. */
  invoiceId?: string;
  /** Link to a subscription canonical ID. */
  subscriptionId?: string;

  /** PSP-level transaction/authorization reference. */
  transactionReference?: string;
  /** Idempotency key used to submit this payment. */
  idempotencyKey?: string;

  /** Statement descriptor shown to the payer. */
  statementDescriptor?: string;
  /** Description visible to the payer. */
  description?: string;

  /** When the authorization was granted. */
  authorizedAt?: Date;
  /** When the capture was confirmed. */
  capturedAt?: Date;
  /** When the refund was processed (for fully refunded payments). */
  refundedAt?: Date;
  /** When the payment expires (for QR / pending cash payments). */
  expiresAt?: Date;

  /** Error code from PSP when rejected. */
  rejectionCode?: string;
  /** Human-readable rejection reason. */
  rejectionReason?: string;

  sourceSystem: string;
  createdAt: Date;
  updatedAt: Date;

  /** Extensibility bag for provider-specific or profile-specific fields. */
  metadata?: Record<string, unknown>;
}

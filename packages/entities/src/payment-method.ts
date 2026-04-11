import type { ExternalId } from './external-id.js';
import type { PaymentMethodType } from './payment.js';

/**
 * Canonical PaymentMethod entity.
 *
 * Represents a tokenized or declared payment instrument.
 * Sensitive data (full PAN, CVV) MUST NOT be stored here;
 * only the tokenReference returned by the PSP.
 */
export interface PaymentMethod {
  canonicalId?: string;
  externalIds: ExternalId[];

  /** PSP that issued the token (e.g. 'mercadopago', 'stripe'). */
  provider: string;
  type: PaymentMethodType;

  /** Card network brand (e.g. 'visa', 'mastercard', 'amex', 'naranja'). */
  brand?: string;
  /** Last 4 digits of the card number. */
  last4?: string;
  expirationMonth?: number;
  expirationYear?: number;
  holderName?: string;
  holderTaxId?: string;

  /** Opaque token reference from the PSP. Never the raw PAN. */
  tokenReference?: string;
  /** Whether this method can be reused for future charges. */
  reusable: boolean;
  /** Canonical customer ID that owns this method. */
  customerId?: string;

  /** Country of issuance (ISO 3166-1 alpha-2). */
  country?: string;
  /** Funding type: credit, debit, prepaid. */
  funding?: 'credit' | 'debit' | 'prepaid' | 'unknown';

  sourceSystem: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

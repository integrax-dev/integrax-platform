import type { ExternalId } from './external-id.js';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'past_due'    // last billing attempt failed
  | 'cancelled'
  | 'expired';

export type BillingFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'custom';      // use billingIntervalDays for custom intervals

/**
 * Canonical Subscription entity.
 *
 * Represents a recurring billing agreement across any PSP or billing system.
 * Provider-specific plan details live in `externalIds` and `metadata`.
 */
export interface Subscription {
  canonicalId?: string;
  externalIds: ExternalId[];

  provider: string;
  providerAccountId?: string;

  /** Provider plan identifier (e.g. Stripe price ID, MP preapproval_plan). */
  planId?: string;
  planName?: string;

  /** Canonical customer ID. */
  customerId?: string;
  /** Canonical payment method used for recurring charges. */
  paymentMethodId?: string;

  status: SubscriptionStatus;

  /** Recurring amount per billing cycle. */
  amount: number;
  currency: string;
  billingFrequency: BillingFrequency;
  /** Used when billingFrequency = 'custom'. */
  billingIntervalDays?: number;

  startedAt?: Date;
  trialEndsAt?: Date;
  nextBillingAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  expiresAt?: Date;

  /** Maximum number of billing cycles (null = unlimited). */
  maxCycles?: number;
  /** Number of billing cycles completed so far. */
  cyclesCompleted?: number;

  sourceSystem: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Payment Provider Capability Matrix
 *
 * Source of truth for what each PSP connector supports.
 * Used by the operation-engine Validator and by the platform UI.
 *
 * Capability status:
 *   full       — fully implemented, tested, production-ready
 *   partial    — implemented but with known limitations (see notes)
 *   unsupported — the PSP does not support this operation
 *   unknown    — not yet researched
 *
 * DO NOT fake support. Only mark 'full' when the facade + tests exist.
 *
 * Tiers:
 *   1 — mercadopago, payway, mobbex, decidir  (LatAm core)
 *   2 — getnet, fiserv, payu
 *   3 — dlocal, paypal, stripe, wibond, addi
 */

export type CapabilityStatus = 'full' | 'partial' | 'unsupported' | 'unknown';

export type PaymentCapabilityKey =
  | 'create_payment'
  | 'authorize_payment'
  | 'capture_payment'
  | 'refund_payment'
  | 'cancel_payment'
  | 'tokenize_payment_method'
  | 'create_subscription'
  | 'cancel_subscription'
  | 'create_checkout_link'
  | 'generate_qr_payment'
  | 'create_split_payment'
  | 'reconcile_payment'
  | 'send_payment_reminder';

export interface ProviderCapabilityEntry {
  status: CapabilityStatus;
  /** Any known limitation or implementation note */
  note?: string;
}

export type ProviderCapabilityRow = Record<PaymentCapabilityKey, ProviderCapabilityEntry>;

export interface ProviderMatrixEntry {
  providerId: string;
  displayName: string;
  tier: 1 | 2 | 3;
  region: string[];
  connectorPath: string;   // relative to connectors/implementations/
  capabilities: ProviderCapabilityRow;
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

export const PAYMENT_PROVIDER_MATRIX: ProviderMatrixEntry[] = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────

  {
    providerId: 'mercadopago',
    displayName: 'Mercado Pago',
    tier: 1,
    region: ['AR', 'BR', 'MX', 'CO', 'CL', 'PE', 'UY'],
    connectorPath: 'mercadopago',
    capabilities: {
      create_payment:          { status: 'full' },
      authorize_payment:       { status: 'full', note: 'via capture_mode=manual' },
      capture_payment:         { status: 'full' },
      refund_payment:          { status: 'full' },
      cancel_payment:          { status: 'full' },
      tokenize_payment_method: { status: 'full', note: 'card token via MercadoPago.js' },
      create_subscription:     { status: 'full', note: 'via preapproval / preapproval_plan' },
      cancel_subscription:     { status: 'full' },
      create_checkout_link:    { status: 'full', note: 'Checkout Pro (preference)' },
      generate_qr_payment:     { status: 'full', note: 'Cobros con QR' },
      create_split_payment:    { status: 'partial', note: 'Marketplace split via collector access_token' },
      reconcile_payment:       { status: 'full' },
      send_payment_reminder:   { status: 'partial', note: 'Via notification API or WhatsApp connector' },
    },
  },

  {
    providerId: 'payway',
    displayName: 'Payway (Prisma)',
    tier: 1,
    region: ['AR'],
    connectorPath: 'payway',
    capabilities: {
      create_payment:          { status: 'partial', note: 'Scaffold — connector not yet implemented' },
      authorize_payment:       { status: 'partial', note: 'Supports two-step auth/capture' },
      capture_payment:         { status: 'partial', note: 'Supports two-step auth/capture' },
      refund_payment:          { status: 'partial', note: 'Scaffold' },
      cancel_payment:          { status: 'partial', note: 'Scaffold' },
      tokenize_payment_method: { status: 'partial', note: 'Token via Payway.js SDK' },
      create_subscription:     { status: 'unsupported' },
      cancel_subscription:     { status: 'unsupported' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unsupported' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'mobbex',
    displayName: 'Mobbex',
    tier: 1,
    region: ['AR'],
    connectorPath: 'mobbex',
    capabilities: {
      create_payment:          { status: 'partial', note: 'Scaffold — connector not yet implemented' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'partial', note: 'Scaffold' },
      cancel_payment:          { status: 'partial', note: 'Scaffold' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'partial', note: 'Mobbex subscriptions API available' },
      cancel_subscription:     { status: 'partial', note: 'Scaffold' },
      create_checkout_link:    { status: 'partial', note: 'Checkout button / hosted page' },
      generate_qr_payment:     { status: 'unknown' },
      create_split_payment:    { status: 'partial', note: 'Split via Mobbex marketplace' },
      reconcile_payment:       { status: 'partial', note: 'Scaffold' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'decidir',
    displayName: 'Decidir (ICBC)',
    tier: 1,
    region: ['AR'],
    connectorPath: 'decidir',
    capabilities: {
      create_payment:          { status: 'partial', note: 'Scaffold — connector not yet implemented' },
      authorize_payment:       { status: 'partial', note: 'Two-step flow supported' },
      capture_payment:         { status: 'partial', note: 'Two-step flow supported' },
      refund_payment:          { status: 'partial', note: 'Scaffold' },
      cancel_payment:          { status: 'partial', note: 'Scaffold' },
      tokenize_payment_method: { status: 'partial', note: 'Token via Decidir.js' },
      create_subscription:     { status: 'unsupported' },
      cancel_subscription:     { status: 'unsupported' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unsupported' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  // ── Tier 2 ────────────────────────────────────────────────────────────────

  {
    providerId: 'getnet',
    displayName: 'Getnet (Santander)',
    tier: 2,
    region: ['AR', 'BR'],
    connectorPath: 'getnet',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'unknown' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unknown' },
      create_split_payment:    { status: 'unknown' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'fiserv',
    displayName: 'Fiserv',
    tier: 2,
    region: ['AR', 'US', 'LATAM'],
    connectorPath: 'fiserv',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'unknown' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unknown' },
      create_split_payment:    { status: 'unknown' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'payu',
    displayName: 'PayU',
    tier: 2,
    region: ['AR', 'CO', 'MX', 'BR', 'PE', 'CL'],
    connectorPath: 'payu',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'unknown' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unknown' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  // ── Tier 3 ────────────────────────────────────────────────────────────────

  {
    providerId: 'dlocal',
    displayName: 'dLocal',
    tier: 3,
    region: ['AR', 'BR', 'MX', 'CO', 'CL', 'PE', 'UY', 'NG', 'ZA'],
    connectorPath: 'dlocal',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'unknown' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown' },
      generate_qr_payment:     { status: 'unknown' },
      create_split_payment:    { status: 'unknown' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'paypal',
    displayName: 'PayPal',
    tier: 3,
    region: ['GLOBAL'],
    connectorPath: 'paypal',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown' },
      create_subscription:     { status: 'unknown', note: 'PayPal subscriptions/plans API exists' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown', note: 'PayPal Orders API' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unknown', note: 'PayPal Marketplace' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'stripe',
    displayName: 'Stripe',
    tier: 3,
    region: ['GLOBAL'],
    connectorPath: 'stripe',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unknown' },
      capture_payment:         { status: 'unknown' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unknown', note: 'Stripe.js / SetupIntents' },
      create_subscription:     { status: 'unknown' },
      cancel_subscription:     { status: 'unknown' },
      create_checkout_link:    { status: 'unknown', note: 'Stripe Checkout Sessions' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unknown', note: 'Stripe Connect' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unknown', note: 'Stripe Invoices + reminders' },
    },
  },

  {
    providerId: 'wibond',
    displayName: 'Wibond',
    tier: 3,
    region: ['AR'],
    connectorPath: 'wibond',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unsupported' },
      capture_payment:         { status: 'unsupported' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unsupported' },
      create_subscription:     { status: 'unsupported' },
      cancel_subscription:     { status: 'unsupported' },
      create_checkout_link:    { status: 'unknown', note: 'BNPL checkout widget' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unsupported' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },

  {
    providerId: 'addi',
    displayName: 'Addi',
    tier: 3,
    region: ['CO', 'MX', 'BR'],
    connectorPath: 'addi',
    capabilities: {
      create_payment:          { status: 'unknown' },
      authorize_payment:       { status: 'unsupported' },
      capture_payment:         { status: 'unsupported' },
      refund_payment:          { status: 'unknown' },
      cancel_payment:          { status: 'unknown' },
      tokenize_payment_method: { status: 'unsupported' },
      create_subscription:     { status: 'unsupported' },
      cancel_subscription:     { status: 'unsupported' },
      create_checkout_link:    { status: 'unknown', note: 'BNPL checkout redirect' },
      generate_qr_payment:     { status: 'unsupported' },
      create_split_payment:    { status: 'unsupported' },
      reconcile_payment:       { status: 'unknown' },
      send_payment_reminder:   { status: 'unsupported' },
    },
  },
];

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getProviderMatrix(providerId: string): ProviderMatrixEntry | undefined {
  return PAYMENT_PROVIDER_MATRIX.find(p => p.providerId === providerId);
}

export function getProvidersForCapability(
  capability: PaymentCapabilityKey,
  minStatus: CapabilityStatus = 'partial',
): ProviderMatrixEntry[] {
  const rank: Record<CapabilityStatus, number> = { full: 3, partial: 2, unknown: 1, unsupported: 0 };
  return PAYMENT_PROVIDER_MATRIX.filter(
    p => rank[p.capabilities[capability].status] >= rank[minStatus],
  );
}

export function getCapabilityStatus(
  providerId: string,
  capability: PaymentCapabilityKey,
): ProviderCapabilityEntry | null {
  const entry = getProviderMatrix(providerId);
  return entry ? entry.capabilities[capability] : null;
}

export interface ToleranceSeed {
  id: string;
  tenantId?: string;
  entityType?: string;
  field?: string;
  connectorPair?: readonly [string, string];
  /** ISO 3166-1 alpha-2 country code */
  country?: string;
  /** ISO 4217 currency code */
  currency?: string;
  strategy: 'absolute' | 'relative' | 'percentage' | 'exact' | 'always_pass';
  value: number;
  unit?: string;
  priority: number;
  enabled: boolean;
}

/** AR-specific tolerance policies for common financial entities */
export const TOLERANCE_SEEDS: ToleranceSeed[] = [
  // ── ARS monetary amounts — 5% relative tolerance (inflation-aware) ───────────
  {
    id: 'tol_ar_ars_amount_relative',
    entityType: 'payment',
    field: 'transaction_amount',
    country: 'AR',
    currency: 'ARS',
    strategy: 'relative',
    value: 0.05,
    unit: '%',
    priority: 10,
    enabled: true,
  },
  {
    id: 'tol_ar_ars_invoice_total',
    entityType: 'invoice',
    field: 'ImpTotal',
    country: 'AR',
    currency: 'ARS',
    strategy: 'relative',
    value: 0.05,
    unit: '%',
    priority: 10,
    enabled: true,
  },
  {
    id: 'tol_ar_ars_invoice_neto',
    entityType: 'invoice',
    field: 'ImpNeto',
    country: 'AR',
    currency: 'ARS',
    strategy: 'relative',
    value: 0.05,
    unit: '%',
    priority: 10,
    enabled: true,
  },
  {
    id: 'tol_ar_ars_invoice_iva',
    entityType: 'invoice',
    field: 'ImpIVA',
    country: 'AR',
    currency: 'ARS',
    strategy: 'absolute',
    value: 1,
    unit: 'ARS',
    priority: 10,
    enabled: true,
  },

  // ── USD amounts — tighter 1% tolerance ───────────────────────────────────────
  {
    id: 'tol_ar_usd_amount_relative',
    entityType: 'payment',
    field: 'transaction_amount',
    country: 'AR',
    currency: 'USD',
    strategy: 'relative',
    value: 0.01,
    unit: '%',
    priority: 10,
    enabled: true,
  },

  // ── Stock quantities — absolute ±1 unit for Argentina warehouses ──────────────
  {
    id: 'tol_ar_stock_quantity',
    entityType: 'stock',
    field: 'quantity',
    country: 'AR',
    strategy: 'absolute',
    value: 1,
    unit: 'units',
    priority: 5,
    enabled: true,
  },

  // ── CUIT / tax IDs — must match exactly ──────────────────────────────────────
  {
    id: 'tol_ar_cuit_exact',
    entityType: 'invoice',
    field: 'DocNro',
    country: 'AR',
    strategy: 'exact',
    value: 0,
    priority: 20,
    enabled: true,
  },
  {
    id: 'tol_ar_customer_cuit_exact',
    entityType: 'customer',
    field: 'taxId',
    country: 'AR',
    strategy: 'exact',
    value: 0,
    priority: 20,
    enabled: true,
  },

  // ── CAE / authorization codes — always exact ─────────────────────────────────
  {
    id: 'tol_ar_cae_exact',
    entityType: 'invoice',
    field: 'CodAutorizacion',
    country: 'AR',
    strategy: 'exact',
    value: 0,
    priority: 20,
    enabled: true,
  },
];

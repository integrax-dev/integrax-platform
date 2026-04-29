-- Migration 021: add country/currency to tolerance_policies + load platform seeds
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.

-- ─── Add missing columns to tolerance_policies ───────────────────────────────

ALTER TABLE tolerance_policies
  ADD COLUMN IF NOT EXISTS country  TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- ─── Platform-default tolerance policies (tenant_id = NULL = applies to all) ──
-- Source: packages/seed-factory/src/tolerance-seeds.ts

INSERT INTO tolerance_policies
  (id, tenant_id, entity_type, field, country, currency, strategy, value, unit, priority, enabled)
VALUES
  -- ARS monetary amounts — 5% relative
  ('tol_ar_ars_amount_relative', NULL, 'payment', 'transaction_amount', 'AR', 'ARS', 'relative', 0.05, '%',     10, TRUE),
  ('tol_ar_ars_invoice_total',   NULL, 'invoice', 'ImpTotal',           'AR', 'ARS', 'relative', 0.05, '%',     10, TRUE),
  ('tol_ar_ars_invoice_neto',    NULL, 'invoice', 'ImpNeto',            'AR', 'ARS', 'relative', 0.05, '%',     10, TRUE),
  ('tol_ar_ars_invoice_iva',     NULL, 'invoice', 'ImpIVA',             'AR', 'ARS', 'absolute', 1,    'ARS',   10, TRUE),
  -- USD amounts — tighter 1%
  ('tol_ar_usd_amount_relative', NULL, 'payment', 'transaction_amount', 'AR', 'USD', 'relative', 0.01, '%',     10, TRUE),
  -- Stock quantities — ±1 unit
  ('tol_ar_stock_quantity',      NULL, 'stock',   'quantity',           'AR', NULL,  'absolute', 1,    'units',  5, TRUE),
  -- CUIT / tax IDs — exact match
  ('tol_ar_cuit_exact',          NULL, 'invoice',  'DocNro',            'AR', NULL,  'exact',    0,    NULL,    20, TRUE),
  ('tol_ar_customer_cuit_exact', NULL, 'customer', 'taxId',             'AR', NULL,  'exact',    0,    NULL,    20, TRUE),
  -- CAE authorization codes — exact
  ('tol_ar_cae_exact',           NULL, 'invoice',  'CodAutorizacion',   'AR', NULL,  'exact',    0,    NULL,    20, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── Ground-truth mapping memory for demo tenant ─────────────────────────────
-- Source: packages/seed-factory/src/mappings.ts
-- Uses demo tenant ten_mvp_demo created in migration 018.

INSERT INTO schema_mapping_memory
  (tenant_id, source_connector_id, target_connector_id, source_path, target_path,
   accepted_count, rejected_count, average_confidence, last_accepted_at)
VALUES
  -- mercadopago ↔ payway
  ('ten_mvp_demo','mercadopago','payway','transaction_amount','amount',             50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','payway','currency_id',       'currency',           50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','payway','status',            'status',             50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','payway','external_reference','external_reference', 50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','payway','installments',      'installments',       50,0,0.9900,NOW()),
  -- mercadopago ↔ mobbex
  ('ten_mvp_demo','mercadopago','mobbex','transaction_amount','total',      50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','mobbex','currency_id',       'currency',   50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','mobbex','status',            'status',     50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','mobbex','external_reference','reference',  50,0,0.9900,NOW()),
  ('ten_mvp_demo','mercadopago','mobbex','date_last_updated', 'updated_at', 50,0,0.9900,NOW()),
  -- contabilium ↔ afip-wsfe
  ('ten_mvp_demo','contabilium','afip-wsfe','Total',             'ImpTotal',  50,0,0.9900,NOW()),
  ('ten_mvp_demo','contabilium','afip-wsfe','Moneda',            'MonId',     50,0,0.9900,NOW()),
  ('ten_mvp_demo','contabilium','afip-wsfe','Estado',            'Resultado', 50,0,0.9900,NOW()),
  ('ten_mvp_demo','contabilium','afip-wsfe','FechaModificacion', 'CbteFch',   50,0,0.9900,NOW()),
  ('ten_mvp_demo','contabilium','afip-wsfe','NumeroCompleto',    'CbteDesde', 50,0,0.9900,NOW())
ON CONFLICT (tenant_id, source_connector_id, target_connector_id, source_path, target_path)
DO NOTHING;

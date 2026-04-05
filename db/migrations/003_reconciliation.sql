-- ============================================================
-- Migration 003 — Reconciliation Engine
-- Adds two tables for entity identity linking and match review.
-- Additive only — does not touch existing schema.
-- Compatible with Postgres 14+.
-- ============================================================

-- ─── Entity Links ─────────────────────────────────────────────────────────────
-- A confirmed link between two external IDs that represent the same real entity.
-- Created automatically (confidence < 1.0) or manually by an operator (confidence = 1.0).

CREATE TABLE IF NOT EXISTS entity_links (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  entity_type    TEXT         NOT NULL,           -- 'product' | 'order' | 'customer' | 'invoice'
  system_a       TEXT         NOT NULL,           -- 'mercadopago' | 'contabilium' | ...
  external_id_a  TEXT         NOT NULL,
  system_b       TEXT         NOT NULL,
  external_id_b  TEXT         NOT NULL,
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 1.000,  -- 0–1
  linked_by      TEXT         NOT NULL DEFAULT 'auto',  -- 'auto' | 'operator'
  match_reason   TEXT,                            -- 'sku_exact' | 'manual_link' | ...
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_entity_link UNIQUE (tenant_id, entity_type, system_a, external_id_a, system_b)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_tenant_entity
  ON entity_links (tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_links_lookup_a
  ON entity_links (tenant_id, entity_type, system_a, external_id_a);
CREATE INDEX IF NOT EXISTS idx_entity_links_lookup_b
  ON entity_links (tenant_id, entity_type, system_b, external_id_b);

-- ─── Entity Match Reviews ─────────────────────────────────────────────────────
-- Candidate matches with confidence below AUTO_LINK_THRESHOLD that need operator review.
-- Created by the reconciliation engine when matchProduct() returns decision='review'.

CREATE TABLE IF NOT EXISTS entity_match_reviews (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  entity_type    TEXT         NOT NULL,
  system_a       TEXT         NOT NULL,
  external_id_a  TEXT         NOT NULL,
  system_b       TEXT         NOT NULL,
  external_id_b  TEXT         NOT NULL,
  confidence     NUMERIC(4,3) NOT NULL,
  match_reason   TEXT,
  status         TEXT         NOT NULL DEFAULT 'pending',   -- 'pending' | 'accepted' | 'rejected'
  reviewed_by    TEXT,                            -- userId who took action
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,

  CONSTRAINT chk_review_status CHECK (status IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_entity_match_reviews_tenant_status
  ON entity_match_reviews (tenant_id, entity_type, status);
CREATE INDEX IF NOT EXISTS idx_entity_match_reviews_pending
  ON entity_match_reviews (tenant_id, status)
  WHERE status = 'pending';

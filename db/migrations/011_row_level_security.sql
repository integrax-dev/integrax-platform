-- ─── Row Level Security (RLS) ────────────────────────────────────────────────
--
-- Aísla los datos de cada tenant a nivel de base de datos.
-- Incluso si hay un bug en el código que omite el filtro tenantId,
-- Postgres rechaza la query antes de devolver datos de otro tenant.
--
-- Uso desde la app:
--   Antes de cualquier query en un request de tenant, ejecutar:
--   SET LOCAL app.current_tenant_id = '<tenantId>';
--
-- Las funciones de plataforma (migraciones, admin) usan el rol
-- `integrax_admin` que bypasea RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'integrax_app') THEN
    CREATE ROLE integrax_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'integrax_admin') THEN
    CREATE ROLE integrax_admin BYPASSRLS;
  END IF;
END $$;

-- Función helper para obtener el tenant del contexto de la sesión
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')
$$ LANGUAGE SQL STABLE;

-- ─── tenant_connectors ────────────────────────────────────────────────────────
ALTER TABLE tenant_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_connectors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_connectors_isolation ON tenant_connectors;
CREATE POLICY tenant_connectors_isolation ON tenant_connectors
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── drift_incidents ──────────────────────────────────────────────────────────
-- drift_incidents no tiene tenant_id directo: el aislamiento se hace por source_id
-- que incluye el tenantId como prefijo. RLS se aplica a nivel de aplicación.
-- Esta tabla es solo accesible por platform_admin — no se expone por tenant.

-- ─── entity_snapshots ─────────────────────────────────────────────────────────
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entity_snapshots_isolation ON entity_snapshots;
CREATE POLICY entity_snapshots_isolation ON entity_snapshots
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── timeline_entries ─────────────────────────────────────────────────────────
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timeline_entries_isolation ON timeline_entries;
CREATE POLICY timeline_entries_isolation ON timeline_entries
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── operations ───────────────────────────────────────────────────────────────
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operations_isolation ON operations;
CREATE POLICY operations_isolation ON operations
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── approvals ────────────────────────────────────────────────────────────────
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approvals_isolation ON approvals;
CREATE POLICY approvals_isolation ON approvals
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── idempotency_keys ─────────────────────────────────────────────────────────
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_isolation ON idempotency_keys;
CREATE POLICY idempotency_keys_isolation ON idempotency_keys
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── schema_mapping_memory ────────────────────────────────────────────────────
ALTER TABLE schema_mapping_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_mapping_memory FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_mapping_memory_isolation ON schema_mapping_memory;
CREATE POLICY schema_mapping_memory_isolation ON schema_mapping_memory
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── identity_aliases ─────────────────────────────────────────────────────────
ALTER TABLE identity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_aliases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_aliases_isolation ON identity_aliases;
CREATE POLICY identity_aliases_isolation ON identity_aliases
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── audit_logs ───────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

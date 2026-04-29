import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';
import './Observability.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuntimeStatus {
  monitoredTenants: number;
  criticalTenants: number;
  connectors: { total: number; failing: number; degraded: number };
  openCases: number;
  signals24h: number;
  evaluatedAt: string;
}

interface ConnectorHealth {
  connectorId: string;
  status: 'healthy' | 'degraded' | 'failing' | 'unknown';
  consecutiveFailures: number;
  pipelineLagMs: number | null;
  lastSuccessfulSyncAt: string | null;
}

interface TenantSyncHealth {
  tenantId: string;
  criticalityTier: 'low' | 'medium' | 'high' | 'critical';
  mappingValidityScore: number;
  openCaseCount: number;
  signalCount24h: number;
  driftDetectedFlag: boolean;
  evaluatedAt: string;
  connectors: ConnectorHealth[];
}

interface ContractChange {
  id: string;
  connectorId: string;
  fieldPath: string;
  changeType: string;
  impactScore: number;
  affectedTenantCount: number;
  detectedAt: string;
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function tierClass(tier: string): string {
  if (tier === 'critical') return 'tier-critical';
  if (tier === 'high') return 'tier-high';
  if (tier === 'medium') return 'tier-medium';
  return 'tier-low';
}

function statusClass(status: string): string {
  if (status === 'healthy') return 'status-ok';
  if (status === 'degraded') return 'status-warn';
  if (status === 'failing') return 'status-err';
  return 'status-unknown';
}

function impactClass(score: number): string {
  if (score >= 3) return 'impact-critical';
  if (score >= 2) return 'impact-high';
  return 'impact-low';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtScore(n: number): string {
  return (n * 100).toFixed(0) + '%';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Observability() {
  const { t } = useTranslation();

  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [tenantHealth, setTenantHealth] = useState<TenantSyncHealth[]>([]);
  const [contractChanges, setContractChanges] = useState<ContractChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, healthRes, changesRes] = await Promise.all([
        fetchAdminJson<{ success: boolean; data: RuntimeStatus }>('/api/admin/observability/runtime-status'),
        fetchAdminJson<{ success: boolean; data: TenantSyncHealth[] }>('/api/admin/observability/tenant-sync-health'),
        fetchAdminJson<{ success: boolean; data: ContractChange[] }>('/api/admin/observability/contract-changes?limit=50'),
      ]);
      if (statusRes.success) setRuntimeStatus(statusRes.data);
      if (healthRes.success) {
        const sorted = [...healthRes.data].sort(
          (a, b) => TIER_RANK[b.criticalityTier] - TIER_RANK[a.criticalityTier],
        );
        setTenantHealth(sorted);
      }
      if (changesRes.success) setContractChanges(changesRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading observability data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="page-loading">{t('common.loading', 'Cargando...')}</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="obs-page">
      {/* ── Runtime status banner ──────────────────────────────────────── */}
      {runtimeStatus && (
        <section className="obs-banner">
          <div className="obs-stat">
            <span className="obs-stat-value">{runtimeStatus.monitoredTenants}</span>
            <span className="obs-stat-label">Tenants monitoreados</span>
          </div>
          <div className={`obs-stat ${runtimeStatus.criticalTenants > 0 ? 'obs-stat--alert' : ''}`}>
            <span className="obs-stat-value">{runtimeStatus.criticalTenants}</span>
            <span className="obs-stat-label">Críticos</span>
          </div>
          <div className={`obs-stat ${runtimeStatus.connectors.failing > 0 ? 'obs-stat--alert' : ''}`}>
            <span className="obs-stat-value">{runtimeStatus.connectors.failing}</span>
            <span className="obs-stat-label">Conectores fallando</span>
          </div>
          <div className={`obs-stat ${runtimeStatus.connectors.degraded > 0 ? 'obs-stat--warn' : ''}`}>
            <span className="obs-stat-value">{runtimeStatus.connectors.degraded}</span>
            <span className="obs-stat-label">Conectores degradados</span>
          </div>
          <div className={`obs-stat ${runtimeStatus.openCases > 0 ? 'obs-stat--warn' : ''}`}>
            <span className="obs-stat-value">{runtimeStatus.openCases}</span>
            <span className="obs-stat-label">Casos abiertos</span>
          </div>
          <div className="obs-stat">
            <span className="obs-stat-value">{runtimeStatus.signals24h}</span>
            <span className="obs-stat-label">Señales 24h</span>
          </div>
          <button type="button" className="obs-refresh-btn" onClick={() => void load()}>
            Actualizar
          </button>
        </section>
      )}

      <div className="obs-body">
        {/* ── Tenant sync health ────────────────────────────────────────── */}
        <section className="obs-section obs-section--wide">
          <h2 className="obs-section-title">Sync Health por Tenant</h2>
          {tenantHealth.length === 0 ? (
            <p className="obs-empty">Sin registros de health. Los datos aparecen cuando los conectores reportan resultados.</p>
          ) : (
            <table className="obs-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Criticidad</th>
                  <th>Validez mapeo</th>
                  <th>Casos abiertos</th>
                  <th>Señales 24h</th>
                  <th>Drift</th>
                  <th>Evaluado</th>
                </tr>
              </thead>
              <tbody>
                {tenantHealth.map(h => (
                  <>
                    <tr
                      key={h.tenantId}
                      className="obs-row obs-row--clickable"
                      onClick={() => setExpandedTenant(expandedTenant === h.tenantId ? null : h.tenantId)}
                    >
                      <td className="obs-monospace">{h.tenantId}</td>
                      <td><span className={`obs-tier ${tierClass(h.criticalityTier)}`}>{h.criticalityTier}</span></td>
                      <td>{fmtScore(h.mappingValidityScore)}</td>
                      <td>{h.openCaseCount}</td>
                      <td>{h.signalCount24h}</td>
                      <td>{h.driftDetectedFlag ? <span className="obs-flag">⚠ sí</span> : '—'}</td>
                      <td className="obs-date">{fmtDate(h.evaluatedAt)}</td>
                    </tr>
                    {expandedTenant === h.tenantId && h.connectors.length > 0 && (
                      <tr key={`${h.tenantId}-detail`} className="obs-row-detail">
                        <td colSpan={7}>
                          <table className="obs-sub-table">
                            <thead>
                              <tr>
                                <th>Conector</th>
                                <th>Estado</th>
                                <th>Fallos consecutivos</th>
                                <th>Lag (ms)</th>
                                <th>Último sync exitoso</th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.connectors.map(c => (
                                <tr key={c.connectorId}>
                                  <td className="obs-monospace">{c.connectorId}</td>
                                  <td><span className={`obs-status ${statusClass(c.status)}`}>{c.status}</span></td>
                                  <td>{c.consecutiveFailures}</td>
                                  <td>{c.pipelineLagMs ?? '—'}</td>
                                  <td className="obs-date">{fmtDate(c.lastSuccessfulSyncAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Contract changes ──────────────────────────────────────────── */}
        <section className="obs-section">
          <h2 className="obs-section-title">Cambios de Contrato de Conectores</h2>
          {contractChanges.length === 0 ? (
            <p className="obs-empty">Sin cambios de contrato detectados.</p>
          ) : (
            <table className="obs-table">
              <thead>
                <tr>
                  <th>Conector</th>
                  <th>Campo</th>
                  <th>Tipo de cambio</th>
                  <th>Impacto</th>
                  <th>Tenants afectados</th>
                  <th>Detectado</th>
                </tr>
              </thead>
              <tbody>
                {contractChanges.map(c => (
                  <tr key={c.id} className="obs-row" title={c.summary}>
                    <td className="obs-monospace">{c.connectorId}</td>
                    <td className="obs-monospace obs-small">{c.fieldPath}</td>
                    <td>{c.changeType}</td>
                    <td><span className={`obs-impact ${impactClass(c.impactScore)}`}>{c.impactScore}</span></td>
                    <td>{c.affectedTenantCount}</td>
                    <td className="obs-date">{fmtDate(c.detectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

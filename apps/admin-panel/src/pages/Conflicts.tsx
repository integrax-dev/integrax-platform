import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type DiffSummary = {
  coveragePercent?: number;
  breakingCount?: number;
  nonBreakingCount?: number;
};

type DiffReport = {
  id: string;
  tenant_id: string;
  workflow_id?: string;
  source_connector_id?: string;
  target_connector_id?: string;
  diff_payload?: {
    summary?: DiffSummary;
  };
  created_at?: string;
};

const MOCK_REPORTS: DiffReport[] = [
  {
    id: 'rep_demo_01',
    tenant_id: 'ten_mvp_demo',
    workflow_id: 'schemaDiff-ten_mvp_demo-01',
    source_connector_id: 'mercadopago',
    target_connector_id: 'contabilium',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    diff_payload: {
      summary: { coveragePercent: 82, breakingCount: 4, nonBreakingCount: 3 },
    },
  },
  {
    id: 'rep_demo_02',
    tenant_id: 'ten_mvp_demo',
    workflow_id: 'schemaDiff-ten_mvp_demo-02',
    source_connector_id: 'mercadopago',
    target_connector_id: 'email',
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    diff_payload: {
      summary: { coveragePercent: 91, breakingCount: 1, nonBreakingCount: 5 },
    },
  },
  {
    id: 'rep_demo_03',
    tenant_id: 'ten_mvp_demo',
    workflow_id: 'schemaDiff-ten_mvp_demo-03',
    source_connector_id: 'afip-wsfe',
    target_connector_id: 'contabilium',
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    diff_payload: {
      summary: { coveragePercent: 100, breakingCount: 0, nonBreakingCount: 2 },
    },
  },
];

type ConflictSeverity = 'all' | 'breaking' | 'warning';

function timeAgo(isoDate?: string): string {
  if (!isoDate) return 'sin fecha';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function conflictKind(report: DiffReport): 'breaking' | 'warning' {
  return (report.diff_payload?.summary?.breakingCount ?? 0) > 0 ? 'breaking' : 'warning';
}

export function Conflicts() {
  const [reports, setReports] = useState<DiffReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<ConflictSeverity>('all');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAdminJson<{ success: boolean; data: DiffReport[] }>('/api/schemas/reports');
      setReports(result.data ?? []);
    } catch (err) {
      if (allowDemoFallbacks) {
        setReports(MOCK_REPORTS);
        setError(null);
      } else {
        setReports([]);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar conflicts');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const conflictReports = useMemo(() => {
    return reports.filter(report => {
      const summary = report.diff_payload?.summary;
      const hasConflict = (summary?.breakingCount ?? 0) > 0 || (summary?.coveragePercent ?? 100) < 95;
      if (!hasConflict) return false;
      if (severityFilter === 'all') return true;
      return conflictKind(report) === severityFilter;
    });
  }, [reports, severityFilter]);

  const summary = useMemo(() => {
    const total = conflictReports.length;
    const breaking = conflictReports.filter(report => conflictKind(report) === 'breaking').length;
    const warning = conflictReports.filter(report => conflictKind(report) === 'warning').length;
    return { total, breaking, warning };
  }, [conflictReports]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Conflicts</h1>
          <p className="text-secondary">Conflictos contractuales detectados a partir de schema reports reales.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => void loadReports()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <Link className="btn btn-secondary btn-sm" to="/schema-diffs">Ver Schema Diffs</Link>
          <Link className="btn btn-secondary btn-sm" to="/mapping-memory">Ver Mapping Memory</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Conflicts</span>
          <strong>{summary.total}</strong>
          <span className="text-secondary">reportes con conflicto operativo</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Breaking</span>
          <strong>{summary.breaking}</strong>
          <span className="text-secondary">rompen compatibilidad</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Warning</span>
          <strong>{summary.warning}</strong>
          <span className="text-secondary">coverage degradada o riesgo medio</span>
        </div>
      </div>

      <div className="action-buttons" style={{ marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${severityFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSeverityFilter('all')}
        >
          Todos
        </button>
        <button
          className={`btn btn-sm ${severityFilter === 'breaking' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSeverityFilter('breaking')}
        >
          Breaking
        </button>
        <button
          className={`btn btn-sm ${severityFilter === 'warning' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSeverityFilter('warning')}
        >
          Warning
        </button>
      </div>

      <div className="workflow-list">
        {loading && conflictReports.length === 0 ? (
          <div className="empty-state">Cargando conflicts...</div>
        ) : conflictReports.length === 0 ? (
          <div className="empty-state">No hay conflicts para este filtro.</div>
        ) : (
          conflictReports.map(report => {
            const summaryData = report.diff_payload?.summary;
            const kind = conflictKind(report);

            return (
              <div key={report.id} className="workflow-card">
                <div className="workflow-header">
                  <div>
                    <h4>
                      {report.source_connector_id ?? 'source'}
                      {' -> '}
                      {report.target_connector_id ?? 'target'}
                    </h4>
                    <span className="text-xs text-muted">{report.id}</span>
                  </div>
                  <span className={`badge ${kind === 'breaking' ? 'badge-error' : 'badge-warning'}`}>
                    {kind === 'breaking' ? 'Breaking' : 'Warning'}
                  </span>
                </div>

                <div className="connector-metadata">
                  <span>{summaryData?.breakingCount ?? 0} breaking</span>
                  <span>{summaryData?.nonBreakingCount ?? 0} non-breaking</span>
                  <span>{summaryData?.coveragePercent ?? 0}% coverage</span>
                  <span>{timeAgo(report.created_at)}</span>
                </div>

                <p className="connector-description">
                  {kind === 'breaking'
                    ? 'Se detectaron cambios incompatibles que requieren intervencion del operador.'
                    : 'No rompe de inmediato, pero la cobertura o la confianza cayeron y conviene revisar el mapping.'}
                </p>

                <div className="connector-actions">
                  <Link className="btn btn-secondary btn-sm" to="/schema-diffs">
                    Revisar diff
                  </Link>
                  <Link className="btn btn-secondary btn-sm" to="/mapping-memory">
                    Ver memory
                  </Link>
                  <Link className="btn btn-primary btn-sm" to="/approvals">
                    Mandar a approvals
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

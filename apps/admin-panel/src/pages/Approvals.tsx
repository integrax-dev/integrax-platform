import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type DriftSeverity = 'critical' | 'major' | 'minor';
type CompatibilityClass = 'safe' | 'suspicious' | 'review-required' | 'breaking';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

type ApiIncident = {
  id: string;
  reportId: string;
  tenantId: string;
  workflowId?: string | null;
  connectorId: string;
  targetConnectorId?: string | null;
  detectedAt: string;
  status: IncidentStatus;
  severity: DriftSeverity;
  compatibilityClass: CompatibilityClass;
  changeCount: number;
  coveragePercent: number | null;
  title: string;
  summary: string;
};

const MOCK_INCIDENTS: ApiIncident[] = [
  {
    id: 'incident-rep_demo_01',
    reportId: 'rep_demo_01',
    tenantId: 'ten_demo_01',
    workflowId: 'schemaDiff-ten_demo_01-01',
    connectorId: 'mercadopago',
    targetConnectorId: 'contabilium',
    detectedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'open',
    severity: 'critical',
    compatibilityClass: 'breaking',
    changeCount: 4,
    coveragePercent: 82,
    title: 'mercadopago -> contabilium drift detected',
    summary: '4 contract changes detected for mercadopago -> contabilium',
  },
  {
    id: 'incident-rep_demo_02',
    reportId: 'rep_demo_02',
    tenantId: 'ten_demo_01',
    workflowId: 'schemaDiff-ten_demo_01-02',
    connectorId: 'mercadopago',
    targetConnectorId: 'email',
    detectedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'investigating',
    severity: 'major',
    compatibilityClass: 'review-required',
    changeCount: 2,
    coveragePercent: 91,
    title: 'mercadopago -> email drift detected',
    summary: '2 contract changes detected for mercadopago -> email',
  },
];

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function queueLabel(incident: ApiIncident): string {
  if (incident.compatibilityClass === 'breaking') return 'Bloqueante';
  if (incident.compatibilityClass === 'review-required') return 'Revision requerida';
  if (incident.status === 'investigating') return 'En investigacion';
  return 'Pendiente';
}

export function Approvals() {
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAdminJson<{ success: boolean; data: ApiIncident[] }>('/api/incidents');
      setIncidents(result.data ?? []);
    } catch (err) {
      if (allowDemoFallbacks) {
        setIncidents(MOCK_INCIDENTS);
        setError(null);
      } else {
        setIncidents([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar approvals');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const queue = useMemo(() => {
    return incidents
      .filter(incident => incident.status === 'open' || incident.status === 'investigating')
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [incidents]);

  const summary = useMemo(() => {
    return {
      total: queue.length,
      breaking: queue.filter(item => item.compatibilityClass === 'breaking').length,
      reviewRequired: queue.filter(item => item.compatibilityClass === 'review-required').length,
      investigating: queue.filter(item => item.status === 'investigating').length,
    };
  }, [queue]);

  const updateLocalStatus = useCallback((incidentId: string, status: IncidentStatus) => {
    setIncidents(prev => prev.map(item => (item.id === incidentId ? { ...item, status } : item)));
  }, []);

  const transition = useCallback(async (incidentId: string, status: Extract<IncidentStatus, 'investigating' | 'resolved' | 'dismissed'>) => {
    const endpoint = status === 'investigating'
      ? 'investigating'
      : status === 'resolved'
        ? 'resolve'
        : 'dismiss';

    setBusyId(incidentId);
    try {
      await fetchAdminJson(`/api/incidents/${incidentId}/${endpoint}`, { method: 'POST' });
      updateLocalStatus(incidentId, status);
      setError(null);
    } catch (err) {
      if (allowDemoFallbacks) {
        updateLocalStatus(incidentId, status);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo actualizar approval');
      }
    } finally {
      setBusyId(null);
    }
  }, [updateLocalStatus]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Approvals</h1>
          <p className="text-secondary">Bandeja de revision humana basada en incidents reales del tenant.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => void loadQueue()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <Link className="btn btn-secondary btn-sm" to="/incidents">Ver Incidents</Link>
          <Link className="btn btn-secondary btn-sm" to="/schema-diffs">Ver Schema Diffs</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Pendientes</span>
          <strong>{summary.total}</strong>
          <span className="text-secondary">items en la bandeja</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Bloqueantes</span>
          <strong>{summary.breaking}</strong>
          <span className="text-secondary">rompen continuidad operativa</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Review required</span>
          <strong>{summary.reviewRequired}</strong>
          <span className="text-secondary">requieren decision humana</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Investigando</span>
          <strong>{summary.investigating}</strong>
          <span className="text-secondary">ya tomados por un operador</span>
        </div>
      </div>

      <div className="workflow-list">
        {loading && queue.length === 0 ? (
          <div className="empty-state">Cargando approvals...</div>
        ) : queue.length === 0 ? (
          <div className="empty-state">No hay aprobaciones pendientes para este tenant.</div>
        ) : (
          queue.map(item => (
            <div key={item.id} className="workflow-card">
              <div className="workflow-header">
                <div>
                  <h4>{item.title}</h4>
                  <span className="text-xs text-muted">
                    {item.connectorId}
                    {item.targetConnectorId ? ` -> ${item.targetConnectorId}` : ''}
                    {' · '}
                    {item.reportId}
                  </span>
                </div>
                <span className={`badge ${item.compatibilityClass === 'breaking' ? 'badge-error' : 'badge-warning'}`}>
                  {queueLabel(item)}
                </span>
              </div>

              <div className="connector-metadata">
                <span>{item.changeCount} cambios detectados</span>
                <span>{item.coveragePercent ?? 0}% coverage</span>
                <span>{timeAgo(item.detectedAt)}</span>
              </div>

              <p className="connector-description">{item.summary}</p>

              <div className="connector-actions">
                {item.status === 'open' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void transition(item.id, 'investigating')}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? 'Actualizando...' : 'Tomar'}
                  </button>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void transition(item.id, 'resolved')}
                  disabled={busyId === item.id}
                >
                  Aprobar / Resolver
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void transition(item.id, 'dismissed')}
                  disabled={busyId === item.id}
                >
                  Rechazar / Dismiss
                </button>
                <Link className="btn btn-secondary btn-sm" to="/incidents">
                  Abrir detalle
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

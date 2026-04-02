import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type DriftSeverity = 'critical' | 'major' | 'minor';
type CompatibilityClass = 'safe' | 'suspicious' | 'review-required' | 'breaking';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

interface ApiIncident {
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
}

const MOCK_INCIDENTS: ApiIncident[] = import.meta.env.PROD && !import.meta.env.VITE_ENABLE_DEMO_FALLBACKS
  ? []
  : [
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
      {
        id: 'incident-rep_demo_03',
        reportId: 'rep_demo_03',
        tenantId: 'ten_demo_01',
        connectorId: 'afip-wsfe',
        targetConnectorId: 'contabilium',
        detectedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        status: 'resolved',
        severity: 'minor',
        compatibilityClass: 'suspicious',
        changeCount: 1,
        coveragePercent: 100,
        title: 'afip-wsfe -> contabilium drift detected',
        summary: '1 contract change detected for afip-wsfe -> contabilium',
      },
    ];

function severityColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'critical':
      return '#dc2626';
    case 'major':
      return '#d97706';
    default:
      return '#2563eb';
  }
}

function statusColor(status: IncidentStatus): string {
  switch (status) {
    case 'open':
      return '#dc2626';
    case 'investigating':
      return '#d97706';
    case 'resolved':
      return '#16a34a';
    default:
      return '#6b7280';
  }
}

function compatibilityLabel(value: CompatibilityClass): string {
  switch (value) {
    case 'review-required':
      return 'review required';
    default:
      return value;
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Incidents() {
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [selected, setSelected] = useState<ApiIncident | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<DriftSeverity | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
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
        setError(err instanceof Error ? err.message : 'Error loading incidents');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const filtered = useMemo(
    () =>
      incidents.filter(incident => {
        if (filterSeverity !== 'all' && incident.severity !== filterSeverity) return false;
        if (filterStatus !== 'all' && incident.status !== filterStatus) return false;
        return true;
      }),
    [filterSeverity, filterStatus, incidents],
  );

  const summary = useMemo(
    () => ({
      critical: incidents.filter(incident => incident.severity === 'critical' && incident.status === 'open').length,
      major: incidents.filter(incident => incident.severity === 'major' && incident.status === 'open').length,
      total: incidents.filter(incident => incident.status === 'open').length,
      resolved: incidents.filter(incident => incident.status === 'resolved').length,
    }),
    [incidents],
  );

  const updateStatus = useCallback((incidentId: string, status: IncidentStatus) => {
    setIncidents(prev => prev.map(incident => (incident.id === incidentId ? { ...incident, status } : incident)));
    setSelected(prev => (prev && prev.id === incidentId ? { ...prev, status } : prev));
  }, []);

  const persistStatus = useCallback(async (incidentId: string, status: Extract<IncidentStatus, 'investigating' | 'resolved' | 'dismissed'>) => {
    const endpoint = status === 'investigating'
      ? 'investigating'
      : status === 'resolved'
        ? 'resolve'
        : 'dismiss';

    try {
      await fetchAdminJson(`/api/incidents/${incidentId}/${endpoint}`, {
        method: 'POST',
      });
      updateStatus(incidentId, status);
      setError(null);
      if (status !== 'investigating') {
        setSelected(null);
      }
    } catch (err) {
      if (allowDemoFallbacks) {
        updateStatus(incidentId, status);
        setError(null);
        if (status !== 'investigating') {
          setSelected(null);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Error updating incident');
      }
    }
  }, [updateStatus]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>API Drift Incidents</h1>
          <p className="page-subtitle">Review contract changes, risk level, and workflow impact for the current tenant.</p>
        </div>
        <div className="action-buttons">
          <a className="btn btn-secondary btn-sm" href="/schema-diffs">Ver Schema Diffs</a>
          <a className="btn btn-secondary btn-sm" href="/mapping-memory">Ver Mapping Memory</a>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="stat-value" style={{ color: '#dc2626' }}>{summary.critical}</div>
          <div className="stat-label">Critical Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #d97706' }}>
          <div className="stat-value" style={{ color: '#d97706' }}>{summary.major}</div>
          <div className="stat-label">Major Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #6b7280' }}>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-label">Total Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <div className="stat-value" style={{ color: '#16a34a' }}>{summary.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            SEVERITY
          </label>
          <select
            value={filterSeverity}
            onChange={event => setFilterSeverity(event.target.value as typeof filterSeverity)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            STATUS
          </label>
          <select
            value={filterStatus}
            onChange={event => setFilterStatus(event.target.value as typeof filterStatus)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void loadIncidents()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {loading && incidents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            Loading incidents...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            No incidents match the current filters.
          </div>
        )}

        {filtered.map(incident => (
          <div
            key={incident.id}
            onClick={() => setSelected(incident.id === selected?.id ? null : incident)}
            style={{
              background: '#fff',
              borderRadius: 8,
              border: `1px solid ${incident.id === selected?.id ? severityColor(incident.severity) : '#e2e8f0'}`,
              borderLeft: `4px solid ${severityColor(incident.severity)}`,
              padding: 16,
              cursor: 'pointer',
              transition: 'box-shadow 0.15s',
              boxShadow: incident.id === selected?.id ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${severityColor(incident.severity)}20`,
                  color: severityColor(incident.severity),
                  textTransform: 'uppercase',
                }}
              >
                {incident.severity}
              </span>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                {incident.connectorId}
                {incident.targetConnectorId ? ` -> ${incident.targetConnectorId}` : ''}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: `${statusColor(incident.status)}15`,
                  color: statusColor(incident.status),
                }}
              >
                {incident.status}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: '#e2e8f0',
                  color: '#475569',
                  textTransform: 'uppercase',
                }}
              >
                {compatibilityLabel(incident.compatibilityClass)}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                {timeAgo(incident.detectedAt)}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#475569' }}>
              {incident.summary}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                report {incident.reportId}
              </span>
              {incident.workflowId && (
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                  workflow {incident.workflowId}
                </span>
              )}
              {incident.coveragePercent != null && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    fontWeight: 600,
                  }}
                >
                  {incident.coveragePercent}% coverage
                </span>
              )}
            </div>

            {incident.id === selected?.id && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>Title:</strong> {incident.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>Detected:</strong> {new Date(incident.detectedAt).toLocaleString('es-AR')}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>Changes detected:</strong> {incident.changeCount}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>Compatibility:</strong> {compatibilityLabel(incident.compatibilityClass)}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>Suggested operator path:</strong>{' '}
                    {incident.compatibilityClass === 'breaking' ? 'review mapping before next run' : 'safe to inspect and continue'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {incident.status === 'open' && (
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        void persistStatus(incident.id, 'investigating');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #d97706',
                        background: '#fffbeb',
                        color: '#d97706',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Mark as Investigating
                    </button>
                  )}
                  {(incident.status === 'open' || incident.status === 'investigating') && (
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        void persistStatus(incident.id, 'resolved');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #16a34a',
                        background: '#f0fdf4',
                        color: '#16a34a',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Resolve
                    </button>
                  )}
                  {incident.status === 'open' && (
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        void persistStatus(incident.id, 'dismissed');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        color: '#6b7280',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

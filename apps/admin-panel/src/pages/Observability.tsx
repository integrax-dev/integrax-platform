import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type MetricsPayload = {
  tenantId: string;
  period: string;
  metrics: {
    eventsReceived: number;
    eventsProcessed: number;
    eventsFailed: number;
    workflowRuns: number;
    successfulRuns: number;
    failedRuns: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    apiCalls: number;
    rateLimitHits: number;
  };
};

type MetricsResponse = {
  success: boolean;
  data: MetricsPayload;
};

type IncidentSummary = {
  id: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  severity: 'critical' | 'major' | 'minor';
};

type WorkflowSummary = {
  id: string;
  name: string;
  enabled: boolean;
};

const MOCK_METRICS: MetricsPayload = {
  tenantId: 'ten_mvp_demo',
  period: 'last_24h',
  metrics: {
    eventsReceived: 1234,
    eventsProcessed: 1200,
    eventsFailed: 34,
    workflowRuns: 567,
    successfulRuns: 550,
    failedRuns: 17,
    avgLatencyMs: 245,
    p95LatencyMs: 890,
    apiCalls: 8901,
    rateLimitHits: 12,
  },
};

const MOCK_INCIDENTS: IncidentSummary[] = [
  { id: 'incident_01', status: 'open', severity: 'critical' },
  { id: 'incident_02', status: 'investigating', severity: 'major' },
];

const MOCK_WORKFLOWS: WorkflowSummary[] = [
  { id: 'flow-mp-invoice', name: 'Facturar Pago MercadoPago', enabled: true },
  { id: 'flow-order-notify', name: 'Notificar Orden Nueva', enabled: true },
  { id: 'flow-stock-sync', name: 'Sincronizar Stock', enabled: false },
];

function percentage(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function Observability() {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [metricsResponse, incidentsResponse, workflowsResponse] = await Promise.all([
          fetchAdminJson<MetricsResponse>('/api/metrics'),
          fetchAdminJson<{ success: boolean; data: IncidentSummary[] }>('/api/incidents'),
          fetchAdminJson<{ success: boolean; data: WorkflowSummary[] }>('/api/workflows'),
        ]);

        if (!cancelled) {
          setMetrics(metricsResponse.data);
          setIncidents(incidentsResponse.data ?? []);
          setWorkflows(workflowsResponse.data ?? []);
        }
      } catch (err) {
        if (allowDemoFallbacks) {
          if (!cancelled) {
            setMetrics(MOCK_METRICS);
            setIncidents(MOCK_INCIDENTS);
            setWorkflows(MOCK_WORKFLOWS);
            setError(null);
          }
        } else if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar observability');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (!metrics) {
      return {
        successRate: '0%',
        failureRate: '0%',
        openIncidents: 0,
        activeFlows: 0,
      };
    }

    const openIncidents = incidents.filter(incident => incident.status === 'open' || incident.status === 'investigating').length;
    const activeFlows = workflows.filter(flow => flow.enabled).length;

    return {
      successRate: percentage(metrics.metrics.eventsProcessed, metrics.metrics.eventsReceived),
      failureRate: percentage(metrics.metrics.eventsFailed, metrics.metrics.eventsReceived),
      openIncidents,
      activeFlows,
    };
  }, [incidents, metrics, workflows]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Observability</h1>
          <p className="text-secondary">Vista operativa del runtime, latencia, errores y salud del tenant actual.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => window.location.reload()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <Link className="btn btn-secondary btn-sm" to="/incidents">Ver Incidents</Link>
          <Link className="btn btn-secondary btn-sm" to="/workflows">Ver Workflows</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Success rate</span>
          <strong>{summary.successRate}</strong>
          <span className="text-secondary">Eventos procesados sobre recibidos</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Failure rate</span>
          <strong>{summary.failureRate}</strong>
          <span className="text-secondary">Errores operativos del periodo</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Open incidents</span>
          <strong>{summary.openIncidents}</strong>
          <span className="text-secondary">Incidentes en estado open o investigating</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Active flows</span>
          <strong>{summary.activeFlows}</strong>
          <span className="text-secondary">Workflows habilitados para este tenant</span>
        </div>
      </div>

      <div className="connector-detail-grid">
        <div className="card">
          <h3>Runtime metrics</h3>
          <div className="connector-detail-list">
            <div className="connector-detail-item">
              <strong>Eventos recibidos</strong>
              <span>{metrics?.metrics.eventsReceived ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Eventos procesados</strong>
              <span>{metrics?.metrics.eventsProcessed ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Workflow runs</strong>
              <span>{metrics?.metrics.workflowRuns ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>API calls</strong>
              <span>{metrics?.metrics.apiCalls ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Rate limit hits</strong>
              <span>{metrics?.metrics.rateLimitHits ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Latency and failures</h3>
          <div className="connector-detail-list">
            <div className="connector-detail-item">
              <strong>Avg latency</strong>
              <span>{metrics?.metrics.avgLatencyMs ?? 0} ms</span>
            </div>
            <div className="connector-detail-item">
              <strong>P95 latency</strong>
              <span>{metrics?.metrics.p95LatencyMs ?? 0} ms</span>
            </div>
            <div className="connector-detail-item">
              <strong>Failed runs</strong>
              <span>{metrics?.metrics.failedRuns ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Failed events</strong>
              <span>{metrics?.metrics.eventsFailed ?? 0}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Periodo</strong>
              <span>{metrics?.period ?? 'last_24h'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Operational shortcuts</h3>
          <span className="text-secondary">Atajos para seguir investigando desde observability</span>
        </div>
        <div className="connector-grid">
          <Link to="/incidents" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">IN</div>
              <div className="connector-info">
                <h4>Incidents</h4>
                <p className="connector-description">Entrar a los drift incidents abiertos y en investigacion.</p>
              </div>
            </div>
          </Link>
          <Link to="/events" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">EV</div>
              <div className="connector-info">
                <h4>Events</h4>
                <p className="connector-description">Cruzar logs operativos con actividad reciente del tenant.</p>
              </div>
            </div>
          </Link>
          <Link to="/workflows" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">WF</div>
              <div className="connector-info">
                <h4>Workflows</h4>
                <p className="connector-description">Revisar o disparar flows habilitados desde el runtime.</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

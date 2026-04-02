import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks, getDefaultTenantId } from '../lib/runtime';
import { useAuthStore } from '../stores/auth';
import './Dashboard.css';

type DashboardData = {
  eventsData: Array<{ name: string; events: number; success: number; failed: number }>;
  connectorUsage: Array<{ name: string; calls: number }>;
  recentEvents: Array<{ id: string; type: string; tenant: string; status: string; time: string }>;
  stats: {
    tenants: number;
    eventsToday: number;
    connectors: number;
    uptime: number;
    openIncidents: number;
    avgCoverage: number;
    mappingFeedbackToday: number;
    avgConfidence: number;
    tenantsChange: string;
    eventsChange: string;
    connectorsChange: string;
    incidentsChange: string;
    coverageChange: string;
  };
};

type TenantLimits = {
  maxWorkflows: number;
  maxConnectors: number;
};

type TenantSettings = {
  id: string;
  name: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  limits: TenantLimits;
};

type TenantConnector = {
  id: string;
  connectorId: string;
  status: 'configured' | 'error' | 'pending' | 'disabled';
};

type ConnectorDefinition = {
  id: string;
};

type Flow = {
  id: string;
  name: string;
  enabled: boolean;
};

type TenantSnapshot = {
  tenantId: string;
  tenantName: string;
  plan: string;
  status: string;
  configuredConnectors: number;
  connectorCapacity: number;
  activeFlows: number;
  workflowCapacity: number;
};

const MOCK_DASHBOARD_DATA: DashboardData = {
  eventsData: [
    { name: '00:00', events: 120, success: 115, failed: 5 },
    { name: '04:00', events: 90, success: 86, failed: 4 },
    { name: '08:00', events: 220, success: 210, failed: 10 },
    { name: '12:00', events: 360, success: 342, failed: 18 },
    { name: '16:00', events: 410, success: 392, failed: 18 },
    { name: '20:00', events: 280, success: 267, failed: 13 },
  ],
  connectorUsage: [
    { name: 'MercadoPago', calls: 1820 },
    { name: 'Contabilium', calls: 1240 },
    { name: 'Email', calls: 980 },
    { name: 'AFIP', calls: 760 },
  ],
  recentEvents: [
    { id: 'evt-1001', type: 'order.created', tenant: 'Acme SA', status: 'success', time: 'hace 2 min' },
    { id: 'evt-1002', type: 'invoice.synced', tenant: 'Globex', status: 'success', time: 'hace 5 min' },
    { id: 'evt-1003', type: 'payment.failed', tenant: 'Umbrella', status: 'failed', time: 'hace 9 min' },
  ],
  stats: {
    tenants: 24,
    eventsToday: 12480,
    connectors: 17,
    uptime: 99.94,
    openIncidents: 3,
    avgCoverage: 87.5,
    mappingFeedbackToday: 14,
    avgConfidence: 0.92,
    tenantsChange: '+3 este mes',
    eventsChange: '+12% vs ayer',
    connectorsChange: '+2 este mes',
    incidentsChange: '3 incidentes abiertos',
    coverageChange: '14 decisiones en 24h',
  },
};

const MOCK_TENANT_SNAPSHOT: TenantSnapshot = {
  tenantId: 'ten_mvp_demo',
  tenantName: 'Integrax Demo Tenant',
  plan: 'Professional',
  status: 'Activo',
  configuredConnectors: 2,
  connectorCapacity: 20,
  activeFlows: 1,
  workflowCapacity: 50,
};

function planLabel(plan: TenantSettings['plan']): string {
  switch (plan) {
    case 'free':
      return 'Free';
    case 'starter':
      return 'Starter';
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan;
  }
}

function statusLabel(status: TenantSettings['status']): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'suspended':
      return 'Suspendido';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

async function loadTenantSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [tenantResponse, connectorsResponse, catalogResponse, workflowsResponse] = await Promise.all([
    fetchAdminJson<{ success: boolean; data: TenantSettings }>(`/api/tenants/${tenantId}`),
    fetchAdminJson<{ success: boolean; data: TenantConnector[] }>('/api/connectors'),
    fetchAdminJson<{ success: boolean; data: ConnectorDefinition[] }>('/api/connectors/catalog'),
    fetchAdminJson<{ success: boolean; data: Flow[] }>('/api/workflows'),
  ]);

  const tenant = tenantResponse.data;
  const configuredConnectors = (connectorsResponse.data ?? []).filter(connector => connector.status !== 'disabled').length;
  const activeFlows = (workflowsResponse.data ?? []).filter(flow => flow.enabled).length;

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    plan: planLabel(tenant.plan),
    status: statusLabel(tenant.status),
    configuredConnectors,
    connectorCapacity: tenant.limits.maxConnectors ?? catalogResponse.data?.length ?? 0,
    activeFlows,
    workflowCapacity: tenant.limits.maxWorkflows,
  };
}

export function Dashboard() {
  const tenantId = useAuthStore(state => state.user?.tenantId) ?? getDefaultTenantId();
  const [data, setData] = useState<DashboardData | null>(null);
  const [tenantSnapshot, setTenantSnapshot] = useState<TenantSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [dashboardData, snapshot] = await Promise.all([
          fetchAdminJson<DashboardData>('/api/admin/dashboard'),
          tenantId ? loadTenantSnapshot(tenantId) : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setData(dashboardData);
          setTenantSnapshot(snapshot);
        }
      } catch (err) {
        if (allowDemoFallbacks) {
          if (!cancelled) {
            setData(MOCK_DASHBOARD_DATA);
            setTenantSnapshot(tenantId ? MOCK_TENANT_SNAPSHOT : null);
            setError(null);
          }
        } else if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (loading) return <div className="dashboard">Cargando...</div>;
  if (error) return <div className="dashboard" style={{ color: 'red' }}>{error}</div>;
  if (!data) return <div className="dashboard">Sin datos</div>;

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-secondary">Resumen de plataforma y del tenant activo en Integrax.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">PL</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.tenants}</span>
            <span className="stat-label">Tenants activos</span>
          </div>
          <span className="stat-change positive">{data.stats.tenantsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">EV</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.eventsToday}</span>
            <span className="stat-label">Eventos hoy</span>
          </div>
          <span className="stat-change positive">{data.stats.eventsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">CX</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.connectors}</span>
            <span className="stat-label">Conectores configurados</span>
          </div>
          <span className="stat-change positive">{data.stats.connectorsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">UP</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.uptime}%</span>
            <span className="stat-label">Uptime</span>
          </div>
          <span className="stat-change neutral">Ultimos 30 dias</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">IN</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.openIncidents}</span>
            <span className="stat-label">Incidentes abiertos</span>
          </div>
          <span className="stat-change negative">{data.stats.incidentsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">CV</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.avgCoverage}%</span>
            <span className="stat-label">Coverage promedio</span>
          </div>
          <span className="stat-change positive">{data.stats.coverageChange}</span>
        </div>
      </div>

      {tenantSnapshot && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Vista del tenant actual</h3>
              <span className="text-secondary">{tenantSnapshot.tenantName} · {tenantSnapshot.tenantId}</span>
            </div>
            <span className="badge badge-info">{tenantSnapshot.plan}</span>
          </div>

          <div className="tenant-summary-grid">
            <div className="tenant-summary-card">
              <span className="stat-kicker">Estado</span>
              <strong>{tenantSnapshot.status}</strong>
              <span className="text-secondary">Salud administrativa del tenant</span>
            </div>
            <div className="tenant-summary-card">
              <span className="stat-kicker">Connectors</span>
              <strong>{tenantSnapshot.configuredConnectors}/{tenantSnapshot.connectorCapacity}</strong>
              <span className="text-secondary">Instancias configuradas</span>
            </div>
            <div className="tenant-summary-card">
              <span className="stat-kicker">Workflows</span>
              <strong>{tenantSnapshot.activeFlows}/{tenantSnapshot.workflowCapacity}</strong>
              <span className="text-secondary">Flows habilitados</span>
            </div>
          </div>

          <div className="tenant-shortcuts">
            <Link className="btn btn-secondary btn-sm" to="/connectors">Ir a Connectors</Link>
            <Link className="btn btn-secondary btn-sm" to="/workflows">Ir a Workflows</Link>
            <Link className="btn btn-secondary btn-sm" to="/settings">Abrir Settings</Link>
          </div>
        </div>
      )}

      <div className="charts-row">
        <div className="chart-card">
          <h3>Eventos por hora</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.eventsData}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Area type="monotone" dataKey="events" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEvents)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3>Uso por conector</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.connectorUsage} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={100} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="calls" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recorrido demo</h3>
          <span className="text-secondary">La historia recomendada para mostrar Integrax en vivo</span>
        </div>
        <div className="connector-grid">
          <Link to="/incidents" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">1</div>
              <div className="connector-info">
                <h4>Incidents</h4>
                <p className="connector-description">Mostrar drift detectado, severidad y estado operativo.</p>
              </div>
            </div>
          </Link>

          <Link to="/schema-diffs" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">2</div>
              <div className="connector-info">
                <h4>Schema Diffs</h4>
                <p className="connector-description">Explicar cambios, coverage y mappings sugeridos.</p>
              </div>
            </div>
          </Link>

          <Link to="/mapping-memory" className="connector-card dashboard-shortcut">
            <div className="connector-header">
              <div className="connector-icon">3</div>
              <div className="connector-info">
                <h4>Mapping Memory</h4>
                <p className="connector-description">Cerrar la historia con feedback persistido y memoria operativa.</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Eventos recientes</h3>
          <Link to="/events" className="text-sm">Ver todos -&gt;</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Tenant</th>
              <th>Estado</th>
              <th>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {data.recentEvents.map(event => (
              <tr key={event.id}>
                <td>
                  <code className="event-type">{event.type}</code>
                </td>
                <td>{event.tenant}</td>
                <td>
                  <span className={`badge badge-${event.status === 'success' ? 'success' : 'error'}`}>
                    {event.status === 'success' ? 'Exito' : 'Error'}
                  </span>
                </td>
                <td className="text-muted">{event.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

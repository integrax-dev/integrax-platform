import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import { useAuthStore } from '../stores/auth';
import { usePlatformStream, type PlatformEvent } from '../lib/usePlatformStream';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type DashboardData = {
  eventsData: Array<{ name: string; events: number; success: number; failed: number }>;
  connectorUsage: Array<{ name: string; calls: number }>;
  recentEvents: Array<{ id: string; type: string; tenant: string; status: string; time: string }>;
  stats: {
    tenants: number;
    eventsToday: number;
    connectors: number;
    uptime: number;
    tenantsChange: string;
    eventsChange: string;
    connectorsChange: string;
  };
};

const MOCK_DASHBOARD_DATA: DashboardData = {
  eventsData: [
    { name: 'W1', events: 3800, success: 3650, failed: 150 },
    { name: 'W2', events: 4400, success: 4240, failed: 160 },
    { name: 'W3', events: 4900, success: 4700, failed: 200 },
    { name: 'W4', events: 5500, success: 5310, failed: 190 },
  ],
  connectorUsage: [
    { name: 'MercadoPago', calls: 1820 },
    { name: 'Contabilium', calls: 1240 },
    { name: 'WhatsApp', calls: 980 },
    { name: 'AFIP', calls: 760 },
  ],
  recentEvents: [
    { id: 'evt-1001', type: 'order.created', tenant: 'Acme SA', status: 'success', time: 'hace 2 min' },
    { id: 'evt-1002', type: 'invoice.synced', tenant: 'Globex', status: 'success', time: 'hace 5 min' },
    { id: 'evt-1003', type: 'payment.failed', tenant: 'Umbrella', status: 'failed', time: 'hace 9 min' },
  ],
  stats: {
    tenants: 128,
    eventsToday: 18400000,
    connectors: 9,
    uptime: 99.94,
    tenantsChange: 'Current snapshot',
    eventsChange: 'Last 30d',
    connectorsChange: 'Native implementations',
  },
};

const kpiIcons = ['▦', '⚠', '∿', '⌁'];

const incidents = [
  { id: 'INC-DEMO-1042', connector: 'Shopify', severity: 'Critical', impact: 'Product price mapping contract drift', tenants: 3, workflows: 4 },
  { id: 'INC-DEMO-1039', connector: 'Contabilium', severity: 'High', impact: 'Invoice total type changed', tenants: 2, workflows: 1 },
  { id: 'INC-DEMO-1033', connector: 'MercadoPago', severity: 'Medium', impact: 'Webhook payload added safe fields', tenants: 1, workflows: 0 },
];

const nativeConnectors = [
  { name: 'AFIP WSFE', status: 'Healthy', domain: 'Billing / Tax' },
  { name: 'Contabilium', status: 'Lagging', domain: 'ERP / Accounting' },
  { name: 'Decidir', status: 'Healthy', domain: 'Payments' },
  { name: 'Email SMTP', status: 'Healthy', domain: 'Messaging' },
  { name: 'Google Sheets', status: 'Healthy', domain: 'Sheets / Data Ops' },
  { name: 'MercadoPago', status: 'Healthy', domain: 'Payments' },
  { name: 'Mobbex', status: 'Healthy', domain: 'Payments' },
  { name: 'Payway', status: 'Contract drift detected', domain: 'Payments' },
  { name: 'WhatsApp Business', status: 'Healthy', domain: 'Messaging' },
];

const activepiecesFamilies = [
  { category: 'Communication', count: 42, note: 'Workflow runtime pieces for messaging and notifications' },
  { category: 'CRM / Sales', count: 36, note: 'Workflow runtime pieces for sales and CRM automation' },
  { category: 'Data / DB', count: 28, note: 'Workflow runtime pieces for data sources and databases' },
  { category: 'Commerce / Payments', count: 19, note: 'Workflow runtime pieces related to commerce and payments' },
];

const capabilityCoverage = [
  { connector: 'MercadoPago', capabilities: ['read', 'write', 'webhook_inbound', 'polling', 'payments'], status: 'Strong' },
  { connector: 'Payway', capabilities: ['read', 'write', 'webhook_inbound', 'payments'], status: 'Partial' },
  { connector: 'Mobbex', capabilities: ['read', 'write', 'webhook_inbound', 'payments'], status: 'Partial' },
  { connector: 'Decidir', capabilities: ['read', 'write', 'webhook_inbound', 'payments'], status: 'Partial' },
  { connector: 'AFIP WSFE', capabilities: ['write', 'fiscal'], status: 'Specialized' },
  { connector: 'Contabilium', capabilities: ['read', 'write', 'polling'], status: 'Strong' },
  { connector: 'Email SMTP', capabilities: ['notification'], status: 'Specialized' },
];

const executionLayers = [
  { layer: 'Native operation engine', share: 'Primary', note: 'Facades, manifests, operation commands, snapshots and timeline' },
  { layer: 'Activepieces runtime', share: 'External', note: 'Workflow piece execution and automation breadth' },
  { layer: 'Temporal workflows', share: 'Durable', note: 'Long-running orchestration, remediation and retries' },
  { layer: 'Manual operator actions', share: 'Controlled', note: 'Approvals, remediations and guarded interventions' },
];

const snapshotDrift = [
  { entity: 'Products', count: 91 },
  { entity: 'Orders', count: 12 },
  { entity: 'Invoices', count: 4 },
];

const mappingMemory = [
  { field: 'price -> unit_price', confidence: '0.93', trend: 'up' },
  { field: 'tax_id -> cuit', confidence: '0.98', trend: 'stable' },
  { field: 'customer_name -> legal_name', confidence: '0.81', trend: 'down' },
];

const operations = [
  { job: 'Replay failed webhooks', queue: 12 },
  { job: 'Re-run reconciliation batch', queue: 4 },
  { job: 'Schema diff re-evaluation', queue: 2 },
];

function severityClass(severity: string) {
  if (severity === 'Critical') return 'badge badge-error';
  if (severity === 'High') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function coverageClass(status: string) {
  if (status === 'Strong') return 'badge badge-success';
  if (status === 'Partial') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function LiveBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="live-badge">{count > 99 ? '99+' : count}</span>;
}

export function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState(0);
  const [liveFailed, setLiveFailed] = useState(0);
  const [liveTenants, setLiveTenants] = useState(0);
  const [liveConnectors, setLiveConnectors] = useState(0);
  const [liveRecent, setLiveRecent] = useState<DashboardData['recentEvents']>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAdminJson<DashboardData>('/api/admin/dashboard');
        if (!cancelled) setData(response);
      } catch {
        if (allowDemoFallbacks && !cancelled) {
          setData(MOCK_DASHBOARD_DATA);
        } else if (!cancelled) {
          setError(t('dashboard.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [t]);

  const getToken = useCallback(() => useAuthStore.getState().token, []);

  usePlatformStream({
    getToken,
    handlers: useMemo(() => ({
      'event.processed': (_env: PlatformEvent) => {
        setLiveEvents(n => n + 1);
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, eventsToday: prev.stats.eventsToday + 1 } } : prev);
        const evt = _env.data as { type?: string; tenant?: string };
        setLiveRecent(prev => [{
          id: `live-${Date.now()}`,
          type: evt?.type ?? 'event',
          tenant: evt?.tenant ?? '—',
          status: 'success',
          time: 'ahora',
        }, ...prev].slice(0, 5));
      },
      'event.failed': (_env: PlatformEvent) => {
        setLiveFailed(n => n + 1);
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, eventsToday: prev.stats.eventsToday + 1 } } : prev);
        const evt = _env.data as { type?: string; tenant?: string };
        setLiveRecent(prev => [{
          id: `live-${Date.now()}`,
          type: evt?.type ?? 'event',
          tenant: evt?.tenant ?? '—',
          status: 'failed',
          time: 'ahora',
        }, ...prev].slice(0, 5));
      },
      'event.dlq': () => setLiveFailed(n => n + 1),
      'tenant.created': () => {
        setLiveTenants(n => n + 1);
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, tenants: prev.stats.tenants + 1 } } : prev);
      },
      'tenant.suspended': () => {
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, tenants: Math.max(0, prev.stats.tenants - 1) } } : prev);
      },
      'connector.created': () => {
        setLiveConnectors(n => n + 1);
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, connectors: prev.stats.connectors + 1 } } : prev);
      },
    }), []),
  });

  if (loading) return <div className="dashboard">{t('common.loading')}</div>;
  if (error) return <div className="dashboard error-state">{error}</div>;
  if (!data) return <div className="dashboard">{t('common.noData')}</div>;

  const recentEvents = liveRecent.length > 0
    ? [...liveRecent, ...data.recentEvents].slice(0, 8)
    : data.recentEvents;
  const throughputSeries = data.eventsData.map(point => point.events);
  const maxThroughput = Math.max(...throughputSeries, 1);
  const healthSeries = [88, 90, 93, 94];
  const labels = data.eventsData.map(point => point.name);
  const kpis = [
    { label: 'Active tenants', value: data.stats.tenants.toString(), sub: data.stats.tenantsChange, scope: 'Current state', live: liveTenants },
    { label: 'Open incidents', value: '12', sub: 'Current queue · 3 critical', scope: 'Current state', live: liveFailed },
    { label: 'Event volume', value: data.stats.eventsToday.toLocaleString(), sub: data.stats.eventsChange, scope: 'Selected range', live: liveEvents },
    { label: 'Awaiting approvals', value: '18', sub: 'Current queue', scope: 'Current state', live: liveConnectors },
  ];

  return (
    <div className="page">
      <section className="admin-hero">
        <h1>IntegraX Control Plane</h1>
        <p>
          Hybrid overview for platform operations: incidents, connector contract health, event pipeline behavior,
          mapping memory stability, and execution pressure across tenants.
        </p>
      </section>

      <section className="overview-grid overview-kpis">
        {kpis.map((kpi, index) => (
          <article key={kpi.label} className="card kpi-card">
            <LiveBadge count={kpi.live} />
            <div className="kpi-topline">
              <div>
                <div className="eyebrow">{kpi.label}</div>
                <div className="micro-label">{kpi.scope}</div>
              </div>
              <span className="kpi-icon">{kpiIcons[index]}</span>
            </div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="text-muted text-xs">{kpi.sub}</div>
          </article>
        ))}
      </section>

      <div className="overview-grid overview-main">
        <section className="card span-7">
          <div className="section-heading">
            <div>
              <h2>Active incidents</h2>
              <p>Current open technical incidents only</p>
            </div>
            <span>Current queue sorted by blast radius</span>
          </div>
          <div className="stack-list">
            {incidents.map(incident => (
              <a key={incident.id} href={`/incidents/${incident.id}`} className="incident-row">
                <div>
                  <div className="micro-label">{incident.id}</div>
                  <strong>{incident.connector}</strong>
                  <p>{incident.impact}</p>
                </div>
                <div className="row-meta">
                  <span>{incident.tenants} tenants · {incident.workflows} workflows</span>
                  <span className={severityClass(incident.severity)}>{incident.severity}</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="card span-5">
          <div className="section-heading">
            <div>
              <h2>Connector estate</h2>
              <p>Three strict buckets only: native, catalog/planned, and Activepieces footprint.</p>
            </div>
            <span>⌁</span>
          </div>
          <div className="mini-grid">
            <div className="inset-card">
              <div className="micro-label">Native connectors implemented</div>
              <strong>9</strong>
              <p>7 healthy · 1 degraded · 1 drifting</p>
            </div>
            <div className="inset-card">
              <div className="micro-label">Activepieces pieces available</div>
              <strong>687</strong>
              <p>Runtime automation surface available across tenants</p>
            </div>
          </div>
          <div className="connector-columns">
            <div>
              <div className="eyebrow compact">Native connectors only</div>
              <div className="compact-list">
                {nativeConnectors.map(connector => (
                  <div key={connector.name} className="connector-line">
                    <div>
                      <strong>{connector.name}</strong>
                      <span>{connector.domain}</span>
                    </div>
                    <em>{connector.status}</em>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow compact">Catalog / planned only</div>
              <div className="empty-dashed">No planned connectors defined yet.</div>
            </div>
          </div>
        </section>

        <section className="card span-7">
          <div className="section-heading">
            <div>
              <h2>Event pipeline health</h2>
              <p>30d · weekly buckets · retries, DLQ and lag indicators</p>
            </div>
            <span>▥</span>
          </div>
          <div className="bar-chart-panel">
            {throughputSeries.map((value, index) => (
              <div key={labels[index] ?? index} className="bar-column">
                <div style={{ height: `${(value / maxThroughput) * 100}%` }} />
                <span>{labels[index]}</span>
              </div>
            ))}
          </div>
          <div className="metric-strip">
            <div><span>Throughput</span><strong>4.2k events/min</strong></div>
            <div><span>Retries</span><strong>31</strong></div>
            <div><span>DLQ size</span><strong>5</strong></div>
            <div><span>Consumer lag</span><strong>120ms</strong></div>
          </div>
        </section>

        <section className="card span-5">
          <div className="section-heading">
            <div>
              <h2>Connector contract health trend</h2>
              <p>30d · weekly buckets · native connector contract stability</p>
            </div>
            <span>◷</span>
          </div>
          <div className="bar-chart-panel">
            {healthSeries.map((value, index) => (
              <div key={labels[index] ?? index} className="bar-column">
                <div className={value < 90 ? 'bar-warning' : 'bar-success'} style={{ height: `${value}%` }} />
                <span>{labels[index]}</span>
              </div>
            ))}
          </div>
          <p className="panel-note">Current score <strong>94/100</strong> · 1 degraded connector with contract drift · 1 lagging polling connector</p>
        </section>

        <section className="card span-4">
          <h2>Current drift backlog</h2>
          <p className="section-copy">Entities currently affected by unresolved snapshot drift</p>
          <div className="simple-list">
            {snapshotDrift.map(item => <div key={item.entity}><span>{item.entity}</span><strong>{item.count} changed</strong></div>)}
          </div>
        </section>

        <section className="card span-4">
          <h2>Mapping memory watchlist</h2>
          <p className="section-copy">Mappings requiring attention due to low confidence or instability</p>
          <div className="simple-list">
            {mappingMemory.map(item => <div key={item.field}><code>{item.field}</code><strong>confidence {item.confidence} · {item.trend}</strong></div>)}
          </div>
        </section>

        <section className="card span-4">
          <h2>Activepieces footprint</h2>
          <p className="section-copy">Runtime automation surface available across tenants</p>
          <div className="stack-list">
            {activepiecesFamilies.map(family => (
              <div key={family.category} className="family-card">
                <div><strong>{family.category}</strong><span>{family.count}</span></div>
                <p>{family.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-7">
          <div className="section-heading">
            <div>
              <h2>Connector capability coverage</h2>
              <p>Current implementation depth by native connector</p>
            </div>
            <span>▦</span>
          </div>
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr><th>Connector</th><th>Capabilities</th><th>Coverage</th></tr>
              </thead>
              <tbody>
                {capabilityCoverage.map(row => (
                  <tr key={row.connector}>
                    <td><strong>{row.connector}</strong></td>
                    <td>
                      <div className="chip-row">
                        {row.capabilities.map(capability => <span key={capability} className="chip">{capability}</span>)}
                      </div>
                    </td>
                    <td><span className={coverageClass(row.status)}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card span-5">
          <div className="section-heading">
            <div>
              <h2>Execution layer distribution</h2>
              <p>How platform work should be categorized</p>
            </div>
            <span>⌁</span>
          </div>
          <div className="stack-list">
            {executionLayers.map(item => (
              <div key={item.layer} className="execution-row">
                <div><strong>{item.layer}</strong><span>{item.share}</span></div>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-12">
          <div className="section-heading">
            <div>
              <h2>Operation command queue</h2>
              <p>Current queue state for controlled execution actions</p>
            </div>
            <span>⌁</span>
          </div>
          <div className="operation-grid">
            {operations.map(operation => (
              <div key={operation.job} className="inset-card">
                <strong>{operation.job}</strong>
                <p>{operation.queue} pending operations</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-12">
          <div className="section-heading">
            <div>
              <h2>{t('dashboard.recentEvents')}</h2>
              <p>Live platform stream merged with latest dashboard events</p>
            </div>
            {liveRecent.length > 0 && <span className="badge badge-success">● {t('common.live')}</span>}
          </div>
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr><th>{t('common.type')}</th><th>{t('common.tenant')}</th><th>{t('common.status')}</th><th>{t('common.time')}</th></tr>
              </thead>
              <tbody>
                {recentEvents.map(event => (
                  <tr key={event.id}>
                    <td><code className="event-type">{event.type}</code></td>
                    <td>{event.tenant}</td>
                    <td>
                      <span className={`badge ${event.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                        {event.status === 'success' ? t('dashboard.success') : t('dashboard.failed')}
                      </span>
                    </td>
                    <td className="text-muted">{event.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

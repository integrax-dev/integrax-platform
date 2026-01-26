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
import './Dashboard.css';

// Mock data
const eventsData = [
  { name: '00:00', events: 120, success: 115, failed: 5 },
  { name: '04:00', events: 80, success: 78, failed: 2 },
  { name: '08:00', events: 250, success: 240, failed: 10 },
  { name: '12:00', events: 380, success: 365, failed: 15 },
  { name: '16:00', events: 420, success: 400, failed: 20 },
  { name: '20:00', events: 300, success: 290, failed: 10 },
];

const connectorUsage = [
  { name: 'MercadoPago', calls: 1250 },
  { name: 'WhatsApp', calls: 890 },
  { name: 'AFIP', calls: 456 },
  { name: 'Email', calls: 678 },
  { name: 'Sheets', calls: 234 },
];

const recentEvents = [
  { id: 1, type: 'payment.approved', tenant: 'Tienda ABC', status: 'success', time: '2 min ago' },
  { id: 2, type: 'invoice.created', tenant: 'Empresa XYZ', status: 'success', time: '5 min ago' },
  { id: 3, type: 'whatsapp.sent', tenant: 'Tienda ABC', status: 'success', time: '8 min ago' },
  { id: 4, type: 'payment.failed', tenant: 'Negocio 123', status: 'failed', time: '12 min ago' },
  { id: 5, type: 'order.created', tenant: 'Tienda ABC', status: 'success', time: '15 min ago' },
];

export function Dashboard() {
  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-secondary">Resumen de la plataforma IntegraX</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">🏢</div>
          <div className="stat-content">
            <span className="stat-value">24</span>
            <span className="stat-label">Tenants Activos</span>
          </div>
          <span className="stat-change positive">+3 este mes</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">⚡</div>
          <div className="stat-content">
            <span className="stat-value">12.5k</span>
            <span className="stat-label">Eventos Hoy</span>
          </div>
          <span className="stat-change positive">+18% vs ayer</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">🔌</div>
          <div className="stat-content">
            <span className="stat-value">89</span>
            <span className="stat-label">Conectores Configurados</span>
          </div>
          <span className="stat-change positive">+12 esta semana</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">📊</div>
          <div className="stat-content">
            <span className="stat-value">99.2%</span>
            <span className="stat-label">Uptime</span>
          </div>
          <span className="stat-change neutral">Últimos 30 días</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>Eventos por Hora</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={eventsData}>
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
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorEvents)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3>Uso por Conector</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={connectorUsage} layout="vertical">
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

      {/* Recent Events */}
      <div className="card">
        <div className="card-header">
          <h3>Eventos Recientes</h3>
          <a href="/events" className="text-sm">Ver todos →</a>
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
            {recentEvents.map((event) => (
              <tr key={event.id}>
                <td>
                  <code className="event-type">{event.type}</code>
                </td>
                <td>{event.tenant}</td>
                <td>
                  <span className={`badge badge-${event.status === 'success' ? 'success' : 'error'}`}>
                    {event.status === 'success' ? '✓ Éxito' : '✗ Error'}
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

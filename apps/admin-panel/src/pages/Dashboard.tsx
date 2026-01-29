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

import { useEffect, useState } from 'react';

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

export function Dashboard() {
  const [data, setData] = useState<DashboardData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/dashboard')
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar dashboard');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dashboard">Cargando...</div>;
  if (error) return <div className="dashboard" style={{color:'red'}}>{error}</div>;
  if (!data) return <div className="dashboard">Sin datos</div>;
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
            <span className="stat-value">{data.stats.tenants}</span>
            <span className="stat-label">Tenants Activos</span>
          </div>
          <span className="stat-change positive">{data.stats.tenantsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">⚡</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.eventsToday}</span>
            <span className="stat-label">Eventos Hoy</span>
          </div>
          <span className="stat-change positive">{data.stats.eventsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">🔌</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.connectors}</span>
            <span className="stat-label">Conectores Configurados</span>
          </div>
          <span className="stat-change positive">{data.stats.connectorsChange}</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">📊</div>
          <div className="stat-content">
            <span className="stat-value">{data.stats.uptime}%</span>
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
            {data.recentEvents.map((event) => (
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

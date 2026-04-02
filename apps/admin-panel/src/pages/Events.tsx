import './Pages.css';
import { useEffect, useMemo, useState } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';

type EventItem = {
  id: string;
  type: string;
  tenant: string;
  connector: string;
  status: string;
  time: string;
  error?: string;
};

const MOCK_EVENTS: EventItem[] = [
  {
    id: 'evt_001',
    type: 'schemas.diff.start',
    tenant: 'Demo Tenant',
    connector: 'mercadopago',
    status: 'processed',
    time: 'hace 1 min',
  },
  {
    id: 'evt_002',
    type: 'incidents.investigating',
    tenant: 'Demo Tenant',
    connector: 'mercadopago',
    status: 'processed',
    time: 'hace 3 min',
  },
  {
    id: 'evt_003',
    type: 'schemas.feedback',
    tenant: 'Demo Tenant',
    connector: 'contabilium',
    status: 'failed',
    time: 'hace 7 min',
    error: 'Confidence drop recorded for rejected mapping',
  },
  {
    id: 'evt_004',
    type: 'incidents.resolve',
    tenant: 'Demo Tenant',
    connector: 'contabilium',
    status: 'processed',
    time: 'hace 10 min',
  },
];

function getStatusTone(status: string): 'success' | 'error' | 'warning' | 'info' {
  if (status === 'processed' || status === 'success') return 'success';
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'dlq' || status === 'warning') return 'warning';
  return 'info';
}

function getStatusLabel(status: string): string {
  if (status === 'processed') return 'Procesado';
  if (status === 'failed') return 'Fallido';
  if (status === 'dlq') return 'DLQ';
  if (status === 'success') return 'Exito';
  return 'Pendiente';
}

export function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [connectorFilter, setConnectorFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAdminJson<{ events: EventItem[] }>('/api/admin/events');
        if (!cancelled) setEvents(data.events || []);
      } catch {
        if (allowDemoFallbacks) {
          if (!cancelled) {
            setEvents(MOCK_EVENTS);
            setError(null);
          }
        } else if (!cancelled) {
          setError('No se pudo cargar eventos');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const connectorOptions = useMemo(
    () => ['all', ...new Set(events.map(event => event.connector).filter(Boolean))],
    [events],
  );

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
      const matchesConnector = connectorFilter === 'all' || event.connector === connectorFilter;
      return matchesStatus && matchesConnector;
    });
  }, [connectorFilter, events, statusFilter]);

  const stats = useMemo(() => {
    const processed = events.filter(event => event.status === 'processed' || event.status === 'success').length;
    const failed = events.filter(event => event.status === 'failed' || event.status === 'error').length;
    const uniqueTenants = new Set(events.map(event => event.tenant)).size;

    return {
      total: events.length,
      processed,
      failed,
      uniqueTenants,
    };
  }, [events]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Eventos</h1>
          <p className="text-secondary">Timeline operativo de drift, feedback y resoluciones del control plane</p>
        </div>
        <div className="flex gap-md" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <a className="btn btn-secondary btn-sm" href="/dashboard">Volver al Dashboard</a>
          <a className="btn btn-secondary btn-sm" href="/incidents">Ver Incidents</a>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="processed">Procesados</option>
            <option value="failed">Fallidos</option>
            <option value="dlq">DLQ</option>
            <option value="pending">Pendientes</option>
          </select>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={connectorFilter}
            onChange={(event) => setConnectorFilter(event.target.value)}
          >
            <option value="all">Todos los conectores</option>
            {connectorOptions.filter(option => option !== 'all').map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Eventos</span>
          <strong>{stats.total}</strong>
          <span className="text-secondary">audit logs visibles</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Procesados</span>
          <strong>{stats.processed}</strong>
          <span className="text-secondary">acciones completadas</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Fallidos</span>
          <strong>{stats.failed}</strong>
          <span className="text-secondary">requieren revisión</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Tenants</span>
          <strong>{stats.uniqueTenants}</strong>
          <span className="text-secondary">con actividad reciente</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Actividad reciente</h3>
          <span className="text-secondary">{filteredEvents.length} evento(s)</span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Tenant</th>
              <th>Conector</th>
              <th>Estado</th>
              <th>Tiempo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={7} style={{ color: 'red' }}>{error}</td></tr>
            ) : filteredEvents.length === 0 ? (
              <tr><td colSpan={7}>No hay eventos para ese filtro</td></tr>
            ) : filteredEvents.map((event) => (
              <tr key={event.id}>
                <td><code className="text-xs">{event.id}</code></td>
                <td><code className="event-type">{event.type}</code></td>
                <td>{event.tenant}</td>
                <td>{event.connector || '-'}</td>
                <td>
                  <span className={`badge badge-${getStatusTone(event.status)}`}>
                    {getStatusLabel(event.status)}
                  </span>
                </td>
                <td className="text-muted">{event.time}</td>
                <td className="event-detail-cell">
                  {event.error ? (
                    <span className="event-detail error-detail">{event.error}</span>
                  ) : (
                    <span className="event-detail ok-detail">Sin error registrado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

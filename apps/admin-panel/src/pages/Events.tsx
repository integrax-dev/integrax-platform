import './Pages.css';
import { useEffect, useState } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';

type Event = {
  id: string;
  type: string;
  tenant: string;
  connector: string;
  status: string;
  time: string;
  error?: string;
};

const MOCK_EVENTS: Event[] = [
  {
    id: 'evt_001',
    type: 'order.created',
    tenant: 'Acme SA',
    connector: 'Shopify',
    status: 'processed',
    time: 'hace 1 min',
  },
  {
    id: 'evt_002',
    type: 'payment.updated',
    tenant: 'Globex',
    connector: 'MercadoPago',
    status: 'pending',
    time: 'hace 3 min',
  },
  {
    id: 'evt_003',
    type: 'invoice.created',
    tenant: 'Umbrella',
    connector: 'AFIP',
    status: 'failed',
    time: 'hace 7 min',
    error: 'Timeout en servicio externo',
  },
  {
    id: 'evt_004',
    type: 'message.sent',
    tenant: 'Acme SA',
    connector: 'WhatsApp',
    status: 'dlq',
    time: 'hace 10 min',
    error: 'Payload inválido',
  },
];

export function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAdminJson<{ events: Event[] }>('/api/admin/events');
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Eventos</h1>
          <p className="text-secondary">Eventos recibidos y procesados</p>
        </div>
        <div className="flex gap-md">
          <select className="input" style={{ width: 'auto' }}>
            <option>Todos los estados</option>
            <option>Procesados</option>
            <option>Pendientes</option>
            <option>Fallidos</option>
            <option>En DLQ</option>
          </select>
          <select className="input" style={{ width: 'auto' }}>
            <option>Todos los conectores</option>
            <option>MercadoPago</option>
            <option>AFIP</option>
            <option>WhatsApp</option>
          </select>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Tenant</th>
              <th>Conector</th>
              <th>Estado</th>
              <th>Tiempo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={7} style={{color:'red'}}>{error}</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={7}>No hay eventos</td></tr>
            ) : events.map((event) => (
              <tr key={event.id}>
                <td><code className="text-xs">{event.id}</code></td>
                <td><code className="event-type">{event.type}</code></td>
                <td>{event.tenant}</td>
                <td>{event.connector}</td>
                <td>
                  <span className={`badge badge-${
                    event.status === 'processed' ? 'success' :
                    event.status === 'failed' ? 'error' :
                    event.status === 'dlq' ? 'warning' : 'info'
                  }`}>
                    {event.status === 'processed' ? '✓ Procesado' :
                     event.status === 'failed' ? '✗ Fallido' :
                     event.status === 'dlq' ? '⚠ DLQ' : '○ Pendiente'}
                  </span>
                </td>
                <td className="text-muted">{event.time}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-secondary btn-sm">Ver</button>
                    {(event.status === 'failed' || event.status === 'dlq') && (
                      <button className="btn btn-primary btn-sm">Reintentar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

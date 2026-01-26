import './Pages.css';

const mockEvents = [
  { id: 'evt_001', type: 'payment.approved', tenant: 'Tienda ABC', connector: 'mercadopago', status: 'processed', time: '2024-02-15 14:32:01' },
  { id: 'evt_002', type: 'invoice.created', tenant: 'Tienda ABC', connector: 'afip-wsfe', status: 'processed', time: '2024-02-15 14:32:05' },
  { id: 'evt_003', type: 'message.sent', tenant: 'Tienda ABC', connector: 'whatsapp', status: 'processed', time: '2024-02-15 14:32:08' },
  { id: 'evt_004', type: 'order.created', tenant: 'Empresa XYZ', connector: 'tiendanube', status: 'failed', time: '2024-02-15 14:30:15', error: 'Timeout' },
  { id: 'evt_005', type: 'payment.pending', tenant: 'Negocio 123', connector: 'mercadopago', status: 'pending', time: '2024-02-15 14:28:45' },
  { id: 'evt_006', type: 'stock.updated', tenant: 'Shop Online', connector: 'contabilium', status: 'dlq', time: '2024-02-15 14:25:00', error: 'Rate limit' },
];

export function Events() {
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
            {mockEvents.map((event) => (
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

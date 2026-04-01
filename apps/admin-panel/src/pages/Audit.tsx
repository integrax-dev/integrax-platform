import { useEffect, useState } from 'react';
import './Pages.css';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';

type AuditLog = {
  id: string;
  action: string;
  user: string;
  resource: string;
  ip: string;
  time: string;
};

const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 'aud_001', action: 'tenant.create', user: 'admin@integrax.com', resource: 'Tienda ABC', ip: '190.2.45.123', time: '2024-02-15 14:30:00' },
  { id: 'aud_002', action: 'connector.configure', user: 'user@tienda.com', resource: 'mercadopago', ip: '200.45.12.89', time: '2024-02-15 14:25:00' },
  { id: 'aud_003', action: 'workflow.publish', user: 'user@tienda.com', resource: 'Facturar Pago', ip: '200.45.12.89', time: '2024-02-15 14:20:00' },
  { id: 'aud_004', action: 'credential.rotate', user: 'admin@empresa.com', resource: 'afip-wsfe', ip: '181.23.45.67', time: '2024-02-15 14:15:00' },
  { id: 'aud_005', action: 'tenant.suspend', user: 'admin@integrax.com', resource: 'Shop Online', ip: '190.2.45.123', time: '2024-02-15 14:10:00' },
  { id: 'aud_006', action: 'user.login', user: 'user@tienda.com', resource: '-', ip: '200.45.12.89', time: '2024-02-15 14:00:00' },
];

const actionLabels: Record<string, { label: string; color: string }> = {
  'tenant.create': { label: 'Crear Tenant', color: 'success' },
  'tenant.suspend': { label: 'Suspender Tenant', color: 'error' },
  'tenant.update': { label: 'Actualizar Tenant', color: 'info' },
  'tenant.delete': { label: 'Cancelar Tenant', color: 'error' },
  'connector.configure': { label: 'Configurar Conector', color: 'info' },
  'workflow.publish': { label: 'Publicar Workflow', color: 'info' },
  'workflow.trigger': { label: 'Trigger Workflow', color: 'info' },
  'workflow.enable': { label: 'Activar Workflow', color: 'success' },
  'workflow.disable': { label: 'Pausar Workflow', color: 'warning' },
  'credential.rotate': { label: 'Rotar Credencial', color: 'warning' },
  'user.login': { label: 'Login', color: 'success' },
};

type BackendEntry = {
  id: string;
  tenantId?: string | null;
  userId: string;
  action: string;
  resource: string;
  ipAddress: string;
  createdAt: string;
};

export function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAdminJson<{ data: BackendEntry[]; success: boolean }>('/api/audit');
        if (!cancelled) {
          const mapped: AuditLog[] = (data.data ?? []).map((e) => ({
            id: e.id,
            action: e.action,
            user: e.userId,
            resource: e.resource,
            ip: e.ipAddress,
            time: new Date(e.createdAt).toLocaleString('es-AR'),
          }));
          setLogs(mapped);
        }
      } catch {
        if (allowDemoFallbacks) {
          if (!cancelled) setLogs(MOCK_AUDIT_LOGS);
        } else if (!cancelled) {
          setError('No se pudo cargar el log de auditoría');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Auditoría</h1>
          <p className="text-secondary">Registro de todas las acciones en la plataforma</p>
        </div>
        <div className="flex gap-md">
          <input className="input" type="date" style={{ width: 'auto' }} />
          <select className="input" style={{ width: 'auto' }}>
            <option>Todas las acciones</option>
            <option>Tenants</option>
            <option>Conectores</option>
            <option>Workflows</option>
            <option>Credenciales</option>
            <option>Login</option>
          </select>
          <button className="btn btn-secondary">Exportar</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Usuario</th>
              <th>Recurso</th>
              <th>IP</th>
              <th>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={5} style={{ color: 'red' }}>{error}</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5}>Sin registros de auditoría aún</td></tr>
            ) : logs.map((log) => {
              const action = actionLabels[log.action] || { label: log.action, color: 'info' };
              return (
                <tr key={log.id}>
                  <td>
                    <span className={`badge badge-${action.color}`}>
                      {action.label}
                    </span>
                  </td>
                  <td>{log.user}</td>
                  <td>{log.resource}</td>
                  <td className="text-muted"><code>{log.ip}</code></td>
                  <td className="text-muted">{log.time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

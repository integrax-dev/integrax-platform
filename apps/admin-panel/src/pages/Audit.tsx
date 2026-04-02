import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type BackendEntry = {
  id: string;
  tenantId?: string | null;
  userId: string;
  action: string;
  resource: string;
  ipAddress: string;
  createdAt: string;
  details?: {
    method?: string;
    responseStatus?: number;
    success?: boolean;
  };
};

type AuditLog = {
  id: string;
  action: string;
  user: string;
  resource: string;
  ip: string;
  time: string;
  tenant: string;
  method: string;
  responseStatus: number | null;
  success: boolean;
};

type AuditResponse = {
  success: boolean;
  data: BackendEntry[];
};

const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud_001',
    action: 'tenant.create',
    user: 'admin@integrax.com',
    resource: '/api/tenants',
    ip: '190.2.45.123',
    time: '15/2/2026 14:30:00',
    tenant: '-',
    method: 'POST',
    responseStatus: 201,
    success: true,
  },
  {
    id: 'aud_002',
    action: 'connector.configure',
    user: 'user@tienda.com',
    resource: '/api/connectors',
    ip: '200.45.12.89',
    time: '15/2/2026 14:25:00',
    tenant: 'ten_mvp_demo',
    method: 'POST',
    responseStatus: 200,
    success: true,
  },
  {
    id: 'aud_003',
    action: 'workflow.trigger',
    user: 'user@tienda.com',
    resource: '/api/workflows/flow-mp-invoice/trigger',
    ip: '200.45.12.89',
    time: '15/2/2026 14:20:00',
    tenant: 'ten_mvp_demo',
    method: 'POST',
    responseStatus: 202,
    success: true,
  },
  {
    id: 'aud_004',
    action: 'tenant.rotate_api_key',
    user: 'admin@empresa.com',
    resource: '/api/tenants/ten_mvp_demo/rotate-api-key',
    ip: '181.23.45.67',
    time: '15/2/2026 14:15:00',
    tenant: 'ten_mvp_demo',
    method: 'POST',
    responseStatus: 200,
    success: true,
  },
  {
    id: 'aud_005',
    action: 'workflow.disable',
    user: 'admin@integrax.com',
    resource: '/api/workflows/flow-mp-invoice/disable',
    ip: '190.2.45.123',
    time: '15/2/2026 14:10:00',
    tenant: 'ten_mvp_demo',
    method: 'PATCH',
    responseStatus: 500,
    success: false,
  },
];

const actionLabels: Record<string, { label: string; color: string }> = {
  'tenant.create': { label: 'Crear tenant', color: 'success' },
  'tenant.suspend': { label: 'Suspender tenant', color: 'error' },
  'tenant.update': { label: 'Actualizar tenant', color: 'info' },
  'tenant.delete': { label: 'Cancelar tenant', color: 'error' },
  'tenant.rotate_api_key': { label: 'Rotar API key', color: 'warning' },
  'connector.configure': { label: 'Configurar conector', color: 'info' },
  'workflow.publish': { label: 'Publicar workflow', color: 'info' },
  'workflow.trigger': { label: 'Trigger workflow', color: 'info' },
  'workflow.enable': { label: 'Activar workflow', color: 'success' },
  'workflow.disable': { label: 'Pausar workflow', color: 'warning' },
  'user.login': { label: 'Login', color: 'success' },
};

function mapEntry(entry: BackendEntry): AuditLog {
  return {
    id: entry.id,
    action: entry.action,
    user: entry.userId,
    resource: entry.resource,
    ip: entry.ipAddress,
    time: new Date(entry.createdAt).toLocaleString('es-AR'),
    tenant: entry.tenantId ?? '-',
    method: entry.details?.method ?? '-',
    responseStatus: entry.details?.responseStatus ?? null,
    success: entry.details?.success ?? true,
  };
}

function badgeTone(log: AuditLog): string {
  if (!log.success || (log.responseStatus ?? 200) >= 400) return 'error';
  return actionLabels[log.action]?.color ?? 'info';
}

export function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (actionFilter !== 'all') query.set('action', actionFilter);
    if (dateFilter) {
      query.set('startDate', new Date(`${dateFilter}T00:00:00`).toISOString());
      query.set('endDate', new Date(`${dateFilter}T23:59:59`).toISOString());
    }

    try {
      const path = query.size > 0 ? `/api/audit?${query.toString()}` : '/api/audit';
      const data = await fetchAdminJson<AuditResponse>(path);
      setLogs((data.data ?? []).map(mapEntry));
    } catch {
      if (allowDemoFallbacks) {
        const filtered = MOCK_AUDIT_LOGS.filter(log => {
          const matchesAction = actionFilter === 'all' || log.action.includes(actionFilter);
          const matchesDate = !dateFilter || log.time.includes(dateFilter.split('-').reverse().join('/'));
          return matchesAction && matchesDate;
        });
        setLogs(filtered);
      } else {
        setError('No se pudo cargar el log de auditoria');
      }
    } finally {
      setLoading(false);
    }
  }, [actionFilter, dateFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const stats = useMemo(() => {
    const total = logs.length;
    const successful = logs.filter(log => log.success).length;
    const failed = logs.filter(log => !log.success).length;
    const uniqueUsers = new Set(logs.map(log => log.user)).size;

    return { total, successful, failed, uniqueUsers };
  }, [logs]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Auditoria</h1>
          <p className="text-secondary">Registro real de acciones sobre tenants, conectores y workflows.</p>
        </div>
        <div className="flex gap-md" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="date"
            value={dateFilter}
            onChange={event => setDateFilter(event.target.value)}
            style={{ width: 'auto' }}
          />
          <select
            className="input"
            value={actionFilter}
            onChange={event => setActionFilter(event.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="all">Todas las acciones</option>
            <option value="tenant">Tenants</option>
            <option value="connector">Connectors</option>
            <option value="workflow">Workflows</option>
            <option value="rotate_api_key">API keys</option>
            <option value="login">Login</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void loadLogs()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Entradas</span>
          <strong>{stats.total}</strong>
          <span className="text-secondary">logs visibles</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Exitosas</span>
          <strong>{stats.successful}</strong>
          <span className="text-secondary">acciones completadas</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Fallidas</span>
          <strong>{stats.failed}</strong>
          <span className="text-secondary">requieren revision</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Usuarios</span>
          <strong>{stats.uniqueUsers}</strong>
          <span className="text-secondary">con actividad registrada</span>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Accion</th>
              <th>Usuario</th>
              <th>Tenant</th>
              <th>Recurso</th>
              <th>Metodo</th>
              <th>Status</th>
              <th>IP</th>
              <th>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>Cargando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8}>Sin registros de auditoria aun</td></tr>
            ) : logs.map(log => {
              const action = actionLabels[log.action] || { label: log.action, color: 'info' };
              return (
                <tr key={log.id}>
                  <td>
                    <span className={`badge badge-${badgeTone(log)}`}>
                      {action.label}
                    </span>
                  </td>
                  <td>{log.user}</td>
                  <td>{log.tenant}</td>
                  <td><code className="text-xs">{log.resource}</code></td>
                  <td>{log.method}</td>
                  <td>
                    <span className={`badge badge-${log.success ? 'success' : 'error'}`}>
                      {log.responseStatus ?? (log.success ? 200 : 500)}
                    </span>
                  </td>
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

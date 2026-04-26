import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type AuditLog = {
  id: string;
  action: string;
  user: string;
  resource: string;
  ip: string;
  time: string;
};

const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 'aud_001', action: 'tenant.create',       user: 'admin@integrax.com', resource: 'Tienda ABC',    ip: '190.2.45.123',  time: '2024-02-15 14:30:00' },
  { id: 'aud_002', action: 'connector.configure', user: 'user@tienda.com',    resource: 'mercadopago',   ip: '200.45.12.89',  time: '2024-02-15 14:25:00' },
  { id: 'aud_003', action: 'workflow.publish',    user: 'user@tienda.com',    resource: 'Facturar Pago', ip: '200.45.12.89',  time: '2024-02-15 14:20:00' },
  { id: 'aud_004', action: 'credential.rotate',   user: 'admin@empresa.com',  resource: 'afip-wsfe',     ip: '181.23.45.67',  time: '2024-02-15 14:15:00' },
  { id: 'aud_005', action: 'tenant.suspend',      user: 'admin@integrax.com', resource: 'Shop Online',   ip: '190.2.45.123',  time: '2024-02-15 14:10:00' },
  { id: 'aud_006', action: 'user.login',          user: 'user@tienda.com',    resource: '-',             ip: '200.45.12.89',  time: '2024-02-15 14:00:00' },
];

const ACTION_META: Record<string, { color: string }> = {
  'tenant.create':       { color: 'success' },
  'tenant.suspend':      { color: 'error' },
  'tenant.update':       { color: 'info' },
  'tenant.delete':       { color: 'error' },
  'connector.configure': { color: 'info' },
  'workflow.publish':    { color: 'info' },
  'workflow.trigger':    { color: 'info' },
  'workflow.enable':     { color: 'success' },
  'workflow.disable':    { color: 'warning' },
  'credential.rotate':   { color: 'warning' },
  'user.login':          { color: 'success' },
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
  const { t } = useTranslation();
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
            time: new Date(e.createdAt).toLocaleString(),
          }));
          setLogs(mapped);
        }
      } catch {
        if (allowDemoFallbacks) {
          if (!cancelled) setLogs(MOCK_AUDIT_LOGS);
        } else if (!cancelled) {
          setError(t('audit.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [t]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('audit.title')}</h1>
          <p className="text-secondary">{t('audit.subtitle')}</p>
        </div>
        <div className="page-toolbar">
          <input className="input input-auto-width" type="date" />
          <select className="input input-auto-width">
            <option>{t('common.all')}</option>
            <option>Tenants</option>
            <option>{t('nav.connectors')}</option>
            <option>{t('nav.workflows')}</option>
            <option>Credentials</option>
            <option>Login</option>
          </select>
          <button className="btn btn-secondary">Export</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t('audit.action')}</th>
              <th>{t('audit.user')}</th>
              <th>{t('audit.resource')}</th>
              <th>{t('audit.ip')}</th>
              <th>{t('common.time')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>{t('common.loading')}</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="table-error">{error}</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5}>{t('audit.noEvents')}</td></tr>
            ) : logs.map((log) => {
              const meta = ACTION_META[log.action] ?? { color: 'info' };
              return (
                <tr key={log.id}>
                  <td>
                    <span className={`badge badge-${meta.color}`}>
                      {log.action}
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

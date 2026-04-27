import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';

import './Pages.css';

type AuditLog = {
  id: string;
  action: string;
  user: string;
  resource: string;
  ip: string;
  time: string;
};



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
  'support.retry_operation': { color: 'warning' },
  'support.replay_webhook': { color: 'warning' },
  'support.approve_reconciliation': { color: 'success' },
  'support.reject_reconciliation': { color: 'error' },
  'support.investigate_incident': { color: 'info' },
  'support.resolve_incident': { color: 'success' },
  'support.dismiss_incident': { color: 'neutral' },
  'support.check_connector_health': { color: 'info' },
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
        const data = await fetchAdminJson<{ data: BackendEntry[]; success: boolean }>('/api/admin/audit');
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
        if (!cancelled) {
          setError(t('audit.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [t]);

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  const filteredLogs = logs.filter((log) => {
    let matchesCategory = true;
    if (categoryFilter !== 'All') {
      const isTenant = log.action.startsWith('tenant.');
      const isConnector = log.action.startsWith('connector.') || log.action.includes('check_connector_health');
      const isWorkflow = log.action.startsWith('workflow.') || log.action.includes('retry_operation') || log.action.includes('replay_webhook');
      const isIncident = log.action.includes('incident');
      const isCreds = log.action.startsWith('credential.');
      const isControl = log.action.startsWith('support.');
      
      switch (categoryFilter) {
        case 'Tenants': matchesCategory = isTenant; break;
        case 'Connectors': matchesCategory = isConnector; break;
        case 'Workflows': matchesCategory = isWorkflow; break;
        case 'Incidents': matchesCategory = isIncident; break;
        case 'Operations': matchesCategory = isControl || isWorkflow; break;
        case 'Credentials': matchesCategory = isCreds; break;
        case 'Login': matchesCategory = log.action === 'user.login'; break;
        default: break;
      }
    }
    
    let matchesDate = true;
    if (dateFilter) {
      matchesDate = log.time.startsWith(dateFilter);
    }
    return matchesCategory && matchesDate;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('audit.title')}</h1>
          <p className="text-secondary">{t('audit.subtitle')}</p>
        </div>
        <div className="page-toolbar">
          <input 
            className="input input-auto-width" 
            type="date" 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)} 
          />
          <select 
            className="input input-auto-width" 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">{t('common.all')}</option>
            <option value="Tenants">Tenants</option>
            <option value="Connectors">Connectors</option>
            <option value="Workflows">Workflows</option>
            <option value="Incidents">Incidents</option>
            <option value="Operations">Operations</option>
            <option value="Credentials">Credentials</option>
            <option value="Login">Login</option>
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
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={5}>{t('audit.noEvents')}</td></tr>
            ) : filteredLogs.map((log) => {
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

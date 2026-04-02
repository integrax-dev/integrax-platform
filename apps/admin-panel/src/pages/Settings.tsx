import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks, getDefaultTenantId } from '../lib/runtime';
import { useAuthStore } from '../stores/auth';
import './Pages.css';

type TenantLimits = {
  requestsPerMinute: number;
  jobsPerMinute: number;
  maxConcurrentJobs: number;
  maxWorkflows: number;
  maxConnectors: number;
  dataRetentionDays: number;
};

type TenantSettings = {
  id: string;
  name: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  webhookSecret: string;
  limits: TenantLimits;
};

type TenantResponse = {
  success: boolean;
  data: TenantSettings;
};

type RotateApiKeyResponse = {
  success: boolean;
  data: {
    apiKey: string;
    message: string;
  };
};

const MOCK_TENANT: TenantSettings = {
  id: 'ten_mvp_demo',
  name: 'Integrax Demo Tenant',
  plan: 'professional',
  status: 'active',
  webhookSecret: 'whsec_demo_mvp_secret',
  limits: {
    requestsPerMinute: 500,
    jobsPerMinute: 1000,
    maxConcurrentJobs: 50,
    maxWorkflows: 50,
    maxConnectors: 20,
    dataRetentionDays: 90,
  },
};

function maskSecret(value: string | null): string {
  if (!value) return 'No disponible';
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function planLabel(plan: TenantSettings['plan']): string {
  switch (plan) {
    case 'free':
      return 'Free';
    case 'starter':
      return 'Starter';
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan;
  }
}

function statusLabel(status: TenantSettings['status']): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'suspended':
      return 'Suspendido';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

function statusBadgeClass(status: TenantSettings['status']): string {
  switch (status) {
    case 'active':
      return 'badge-success';
    case 'suspended':
      return 'badge-warning';
    case 'cancelled':
      return 'badge-error';
    default:
      return 'badge-info';
  }
}

const MOCK_NOTIFICATIONS = {
  workflowFailure: true,
  limitsThreshold: true,
  dailyDigest: false,
  securityAlerts: true,
};

export function Settings() {
  const userTenantId = useAuthStore(state => state.user?.tenantId);
  const tenantId = userTenantId ?? getDefaultTenantId();

  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [rotating, setRotating] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError('No hay un tenant activo seleccionado');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminJson<TenantResponse>(`/api/tenants/${tenantId}`);
      setTenant(response.data);
    } catch (err) {
      if (allowDemoFallbacks) {
        setTenant(MOCK_TENANT);
        setError(null);
      } else {
        setTenant(null);
        setError(err instanceof Error ? err.message : 'No se pudo cargar la configuracion del tenant');
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const rotateApiKey = useCallback(async () => {
    if (!tenantId) return;

    setRotating(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetchAdminJson<RotateApiKeyResponse>(`/api/tenants/${tenantId}/rotate-api-key`, {
        method: 'POST',
      });
      setApiKey(response.data.apiKey);
      setShowApiKey(true);
      setActionMessage(response.data.message);
    } catch (err) {
      if (allowDemoFallbacks) {
        setApiKey('ixk_demo_rotated_key_1234567890abcdef');
        setShowApiKey(true);
        setActionMessage('API key rotada (simulada). Guardala antes de salir.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo rotar la API key');
      }
    } finally {
      setRotating(false);
    }
  }, [tenantId]);

  const copyValue = useCallback(async (value: string | null, label: string) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setActionMessage(`${label} copiada al portapapeles`);
    } catch {
      setActionMessage(`No se pudo copiar ${label.toLowerCase()}`);
    }
  }, []);

  const limitRows = useMemo(() => {
    if (!tenant) return [];

    return [
      ['Requests por minuto', `${tenant.limits.requestsPerMinute}`],
      ['Jobs por minuto', `${tenant.limits.jobsPerMinute}`],
      ['Concurrencia maxima', `${tenant.limits.maxConcurrentJobs}`],
      ['Workflows activos', `${tenant.limits.maxWorkflows}`],
      ['Conectores', `${tenant.limits.maxConnectors}`],
      ['Retencion de datos', `${tenant.limits.dataRetentionDays} dias`],
    ];
  }, [tenant]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuracion</h1>
          <p className="text-secondary">Settings operativos del tenant sobre el control-plane real.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => void loadSettings()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionMessage && <div className="alert alert-info">{actionMessage}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Tenant</span>
          <strong>{tenant?.name ?? 'N/A'}</strong>
          <span className="text-secondary">{tenant?.id ?? tenantId ?? 'sin tenant'}</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Plan</span>
          <strong>{tenant ? planLabel(tenant.plan) : 'N/A'}</strong>
          <span className="text-secondary">Limites y capacidad asignada</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Estado</span>
          <strong>{tenant ? statusLabel(tenant.status) : 'N/A'}</strong>
          <span className="text-secondary">Disponibilidad del tenant</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Webhook</span>
          <strong>{tenant ? maskSecret(tenant.webhookSecret) : 'N/A'}</strong>
          <span className="text-secondary">Secret vigente del endpoint entrante</span>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>API Keys</h3>
          <p className="text-secondary text-sm mb-md">
            La API key solo puede verse inmediatamente despues de la rotacion.
          </p>

          <div className="api-key-item">
            <div>
              <span className="font-medium">Tenant API Key</span>
              <br />
              <code className="text-xs">
                {showApiKey ? apiKey ?? 'Rotala para generar una nueva key' : maskSecret(apiKey)}
              </code>
            </div>
            <div className="action-buttons">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void copyValue(apiKey, 'API key')}
                disabled={!apiKey}
              >
                Copiar
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => void rotateApiKey()} disabled={rotating}>
                {rotating ? 'Rotando...' : 'Rotar'}
              </button>
            </div>
          </div>

          <div className="settings-note">
            <span className="badge badge-warning">Sensitivo</span>
            <span className="text-secondary text-sm">
              Si rotas la key, las integraciones actuales deben actualizar su configuracion.
            </span>
          </div>
        </div>

        <div className="card">
          <h3>Webhooks</h3>
          <p className="text-secondary text-sm mb-md">
            Configuracion del endpoint entrante para este tenant.
          </p>

          <div className="form-group">
            <label className="label">Webhook URL</label>
            <input
              className="input"
              value={tenantId ? `https://api.integrax.io/webhooks/${tenantId}` : 'No disponible'}
              readOnly
            />
          </div>

          <div className="form-group">
            <label className="label">Signing Secret</label>
            <div className="flex gap-sm">
              <input
                className="input"
                type={showWebhookSecret ? 'text' : 'password'}
                value={tenant?.webhookSecret ?? ''}
                readOnly
              />
              <button className="btn btn-secondary" onClick={() => setShowWebhookSecret(current => !current)} disabled={!tenant}>
                {showWebhookSecret ? 'Ocultar' : 'Ver'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => void copyValue(tenant?.webhookSecret ?? null, 'Signing secret')}
                disabled={!tenant}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Limites del plan</h3>
          <p className="text-secondary text-sm mb-md">
            Plan actual:{' '}
            <span className="badge badge-info">{tenant ? planLabel(tenant.plan) : 'Sin datos'}</span>
          </p>

          {limitRows.map(([label, value]) => (
            <div key={label} className="limit-item">
              <span>{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}

          <div className="settings-note">
            <span className={`badge ${tenant ? statusBadgeClass(tenant.status) : 'badge-info'}`}>
              {tenant ? statusLabel(tenant.status) : 'Sin estado'}
            </span>
            <span className="text-secondary text-sm">
              Para cambios de plan o limites, hoy se hace desde tenancy admin en el control-plane.
            </span>
          </div>
        </div>

        <div className="card">
          <h3>Notificaciones</h3>
          <p className="text-secondary text-sm mb-md">
            Estas preferencias siguen siendo locales de UI hasta definir el backend compartido.
          </p>

          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked={MOCK_NOTIFICATIONS.workflowFailure} />
              <span>Email cuando un workflow falla</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked={MOCK_NOTIFICATIONS.limitsThreshold} />
              <span>Email cuando se alcanza 80% del limite</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked={MOCK_NOTIFICATIONS.dailyDigest} />
              <span>Email resumen diario</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked={MOCK_NOTIFICATIONS.securityAlerts} />
              <span>Alertas de seguridad</span>
            </label>
          </div>

          <button className="btn btn-secondary mt-md" disabled title="Persistencia de preferencias en el siguiente slice">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';
import './Workflows.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface APFlow {
  id: string;
  name: string;
  status: 'ENABLED' | 'DISABLED';
  publishedVersionId?: string;
  version?: {
    trigger?: { type: string; displayName?: string };
    steps?: unknown[];
  };
}

interface EmbedConfig {
  baseUrl: string;
  token: string | null;
  email?: string;
  password?: string;
  projectId?: string;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_FLOWS: APFlow[] = [
  { id: 'flow_001', name: 'Facturar Pago MercadoPago', status: 'ENABLED' },
  { id: 'flow_002', name: 'Notificar Orden Nueva',      status: 'ENABLED' },
  { id: 'flow_003', name: 'Sincronizar Stock',          status: 'DISABLED' },
];

// ─── AP iframe drawer ─────────────────────────────────────────────────────────

function ApDrawer({
  embedConfig,
  flowId,
  onClose,
}: {
  embedConfig: EmbedConfig;
  flowId: string | null;  // null = new flow
  onClose: () => void;
}) {
  const [iframeError, setIframeError] = useState(false);

  const iframeUrl = (() => {
    const { baseUrl, token, email, password, projectId } = embedConfig;
    const target = flowId ? `/flows/${flowId}` : '/flows';
    if (token) return `${baseUrl}${target}?token=${encodeURIComponent(token)}`;
    if (email && password) {
      const qs = new URLSearchParams({ email, password, redirect: target });
      if (projectId) qs.set('projectId', projectId);
      return `${baseUrl}/auto-login.html?${qs}`;
    }
    return `${baseUrl}${target}`;
  })();

  const openInNewTab = useCallback(() => {
    window.open(iframeUrl, '_blank', 'noopener,noreferrer');
  }, [iframeUrl]);

  return (
    <div className="ap-drawer-overlay" onClick={onClose}>
      <div className="ap-drawer" onClick={e => e.stopPropagation()}>
        <div className="ap-drawer-header">
          <span className="ap-drawer-title">
            {flowId ? 'Editar workflow' : 'Nuevo workflow'}
          </span>
          <div className="ap-drawer-actions">
            <button className="btn btn-secondary btn-sm" onClick={openInNewTab} title="Abrir en nueva pestaña">
              ↗ Nueva pestaña
            </button>
            <button className="btn-icon" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>

        {iframeError ? (
          <div className="ap-iframe-fallback">
            <p className="text-secondary">
              El builder de Activepieces no puede cargarse en un iframe<br />
              (posiblemente por restricciones de seguridad del servidor AP).
            </p>
            <button className="btn btn-primary" onClick={openInNewTab}>
              Abrir Activepieces en nueva pestaña ↗
            </button>
            <p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>
              Para habilitar el embed, agregá <code>ALLOWED_ORIGINS={window.location.origin}</code> a la config de AP.
            </p>
          </div>
        ) : (
          <iframe
            src={iframeUrl}
            className="ap-iframe"
            title="Activepieces builder"
            allow="clipboard-read; clipboard-write"
            onError={() => setIframeError(true)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Workflows() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const tenantId = user?.tenantId ?? user?.id ?? 'default';

  const [flows, setFlows]           = useState<APFlow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [embedConfig, setEmbedConfig] = useState<EmbedConfig | null>(null);
  const [drawerFlowId, setDrawerFlowId] = useState<string | null | undefined>(undefined);
  // undefined = drawer closed, null = new flow, string = edit existing

  // Load flows + embed config in parallel
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [flowsRes, configRes] = await Promise.allSettled([
          fetchAdminJson<{ data: APFlow[] }>(`/api/tenants/${tenantId}/flows`),
          fetchAdminJson<{ data: EmbedConfig }>(`/api/ap/embed-config?tenantId=${tenantId}`),
        ]);

        if (!cancelled) {
          if (flowsRes.status === 'fulfilled') {
            setFlows(flowsRes.value.data ?? []);
          } else if (allowDemoFallbacks) {
            setFlows(MOCK_FLOWS);
          } else {
            setError('No se pudieron cargar los workflows');
          }

          if (configRes.status === 'fulfilled') {
            setEmbedConfig(configRes.value.data);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tenantId]);

  const toggleFlow = async (flowId: string, enable: boolean) => {
    try {
      await fetchAdminJson(`/api/tenants/${tenantId}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      setFlows(prev => prev.map(f =>
        f.id === flowId ? { ...f, status: enable ? 'ENABLED' : 'DISABLED' } : f,
      ));
    } catch {
      // ignore — optimistic update already shown, revert on next load
    }
  };

  const openDrawer = (flowId: string | null) => {
    if (!embedConfig) return;
    setDrawerFlowId(flowId);
  };

  if (loading) return <div className="page"><div className="page-header"><h1>{t('workflows.title')}</h1></div><p className="text-secondary">{t('common.loading')}</p></div>;
  if (error)   return <div className="page"><div className="page-header"><h1>{t('workflows.title')}</h1></div><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  const apConfigured = !!embedConfig?.baseUrl;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('workflows.title')}</h1>
          <p className="text-secondary">{t('workflows.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!apConfigured && (
            <span className="badge badge-warning" title="Configurar ACTIVEPIECES_BASE_URL en el servidor">
              AP no configurado
            </span>
          )}
          <button
            className="btn btn-primary"
            disabled={!apConfigured}
            onClick={() => openDrawer(null)}
          >
            + {t('workflows.newWorkflow') ?? 'Nuevo Workflow'}
          </button>
        </div>
      </div>

      {flows.length === 0 ? (
        <div className="empty-state">
          <p className="text-secondary">
            {apConfigured
              ? 'No hay workflows configurados. Creá el primero.'
              : 'Configurá ACTIVEPIECES_BASE_URL y ACTIVEPIECES_API_KEY para conectar Activepieces.'}
          </p>
        </div>
      ) : (
        <div className="workflow-list">
          {flows.map(flow => (
            <div key={flow.id} className="workflow-card">
              <div className="workflow-header">
                <div>
                  <h4>{flow.name}</h4>
                  <span className="text-xs text-muted">{flow.id}</span>
                </div>
                <span className={`badge badge-${flow.status === 'ENABLED' ? 'success' : 'warning'}`}>
                  {flow.status === 'ENABLED' ? `● ${t('workflows.active') ?? 'Activo'}` : `◐ ${t('workflows.paused') ?? 'Pausado'}`}
                </span>
              </div>

              {flow.version?.trigger && (
                <div className="workflow-trigger">
                  {flow.version.trigger.type === 'WEBHOOK'
                    ? `📨 Webhook: ${flow.version.trigger.displayName ?? flow.version.trigger.type}`
                    : `⏰ ${flow.version.trigger.displayName ?? flow.version.trigger.type}`}
                </div>
              )}

              <div className="connector-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!apConfigured}
                  onClick={() => openDrawer(flow.id)}
                >
                  {t('common.edit')}
                </button>
                {flow.status === 'ENABLED' ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleFlow(flow.id, false)}>
                    {t('workflows.pause') ?? 'Pausar'}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => toggleFlow(flow.id, true)}>
                    {t('workflows.activate') ?? 'Activar'}
                  </button>
                )}
                {apConfigured && embedConfig && (
                  <a
                    href={`${embedConfig.baseUrl}/flows/${flow.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    ↗ AP
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {drawerFlowId !== undefined && embedConfig && (
        <ApDrawer
          embedConfig={embedConfig}
          flowId={drawerFlowId}
          onClose={() => setDrawerFlowId(undefined)}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';
import './Workflows.css';

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

type NativeWorkflow = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: 'active' | 'inactive';
};

const MOCK_FLOWS: APFlow[] = [
  { id: 'flow_001', name: 'Sin titulo', status: 'DISABLED', version: { trigger: { type: 'Select Trigger' } } },
  { id: 'flow_002', name: 'Sin titulo', status: 'DISABLED', version: { trigger: { type: 'Select Trigger' } } },
];

const NATIVE_WORKFLOWS: NativeWorkflow[] = [
  {
    id: 'native_001',
    name: 'ML Pedido → Factura AFIP → Email',
    description: 'Cuando llega pedido de MercadoLibre, generar factura y notificar',
    trigger: 'Evento',
    status: 'inactive',
  },
  {
    id: 'native_002',
    name: 'Sync Stock ERP ↔ Shopify',
    description: 'Sincronizar inventario bidireccional cada 15 minutos',
    trigger: 'Programado',
    status: 'inactive',
  },
  {
    id: 'native_003',
    name: 'Actualizacion de precios masiva',
    description: 'Leer precios de Sheets y actualizar en todas las plataformas',
    trigger: 'Manual',
    status: 'inactive',
  },
];

function Icon({ name }: { name: 'bolt' | 'plus' | 'eye' | 'external' | 'play' }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.7',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'bolt') {
    return (
      <svg {...common}>
        <path d="M10.8 2.8 5.8 10h3.4l-.8 7.2 5.8-8.3H10.8l0-6.1Z" />
      </svg>
    );
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M10 4.5v11" />
        <path d="M4.5 10h11" />
      </svg>
    );
  }

  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2.8 10s2.6-4.2 7.2-4.2 7.2 4.2 7.2 4.2-2.6 4.2-7.2 4.2S2.8 10 2.8 10Z" />
        <circle cx="10" cy="10" r="1.8" />
      </svg>
    );
  }

  if (name === 'external') {
    return (
      <svg {...common}>
        <path d="M11.5 4.5h4v4" />
        <path d="m9 11 6.5-6.5" />
        <path d="M8 6H5.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1H13a1 1 0 0 0 1-1V12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m7 5 6 5-6 5V5Z" />
    </svg>
  );
}

function ApDrawer({
  embedConfig,
  flowId,
  onClose,
}: {
  embedConfig: EmbedConfig;
  flowId: string | null;
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
      <div className="ap-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="ap-drawer-header">
          <span className="ap-drawer-title">{flowId ? 'Editar workflow' : 'Nuevo workflow'}</span>
          <div className="ap-drawer-actions">
            <button className="btn btn-secondary btn-sm" onClick={openInNewTab} title="Abrir en nueva pestaña">
              <Icon name="external" />
              Nueva pestaña
            </button>
            <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </div>
        </div>

        {iframeError ? (
          <div className="ap-iframe-fallback">
            <p className="text-secondary">
              El builder de Activepieces no puede cargarse en un iframe.
              <br />
              Posiblemente por restricciones de seguridad del servidor AP.
            </p>
            <button className="btn btn-primary" onClick={openInNewTab}>
              Abrir Activepieces en nueva pestaña
            </button>
            <p className="text-muted workflow-fallback-copy">
              Para habilitar el embed, agregá <code>ALLOWED_ORIGINS={window.location.origin}</code>.
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

function formatFlowStatus(flow: APFlow, t: ReturnType<typeof useTranslation>['t']) {
  if (flow.status === 'ENABLED') {
    return { label: t('workflows.active') ?? 'Activo', className: 'badge badge-success' };
  }

  return { label: t('workflows.paused') ?? 'Pausado', className: 'badge badge-neutral workflow-badge' };
}

export function Workflows() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const tenantId = user?.tenantId ?? user?.id ?? 'default';

  const [flows, setFlows] = useState<APFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [embedConfig, setEmbedConfig] = useState<EmbedConfig | null>(null);
  const [drawerFlowId, setDrawerFlowId] = useState<string | null | undefined>(undefined);

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
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const toggleFlow = async (flowId: string, enable: boolean) => {
    try {
      await fetchAdminJson(`/api/tenants/${tenantId}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      setFlows((current) =>
        current.map((flow) => (flow.id === flowId ? { ...flow, status: enable ? 'ENABLED' : 'DISABLED' } : flow)),
      );
    } catch {
      // optimistic-ish UI only
    }
  };

  const openDrawer = (flowId: string | null) => {
    if (!embedConfig) return;
    setDrawerFlowId(flowId);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{t('workflows.title')}</h1>
        </div>
        <p className="text-secondary">{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{t('workflows.title')}</h1>
        </div>
        <p className="text-secondary">{error}</p>
      </div>
    );
  }

  const apConfigured = Boolean(embedConfig?.baseUrl);

  return (
    <div className="page workflows-page">
      <div className="page-header workflows-header">
        <div>
          <h1>{t('workflows.title')}</h1>
          <p className="workflow-subtitle">{t('workflows.subtitle')}</p>
        </div>

        <div className="workflow-toolbar">
          {!apConfigured && (
            <span className="badge badge-warning" title="Configurar ACTIVEPIECES_BASE_URL en el servidor">
              AP no configurado
            </span>
          )}
          <button className="btn btn-purple" disabled={!apConfigured} onClick={() => openDrawer(null)}>
            <Icon name="bolt" />
            Nuevo en AP
          </button>
          <button className="btn btn-primary">
            <Icon name="plus" />
            IntegraX Builder
          </button>
        </div>
      </div>

      <section className="workflow-group">
        <header className="workflow-group-header">
          <div className="workflow-group-title">
            <span className="workflow-group-icon workflow-group-icon-purple">
              <Icon name="bolt" />
            </span>
            <span>Flows de Activepieces</span>
          </div>
        </header>

        <div className="workflow-group-body">
          {(flows.length === 0 ? MOCK_FLOWS : flows).map((flow) => {
            const status = formatFlowStatus(flow, t);
            return (
              <article key={flow.id} className="ap-flow-row">
                <div className="ap-flow-copy">
                  <div className="ap-flow-heading">
                    <strong>{flow.name || 'Sin titulo'}</strong>
                    <span className={status.className}>{status.label}</span>
                  </div>
                  <span className="ap-flow-trigger">{flow.version?.trigger?.displayName ?? flow.version?.trigger?.type ?? 'Select Trigger'}</span>
                </div>

                <div className="ap-flow-actions">
                  <button className="btn btn-secondary btn-sm" disabled={!apConfigured} onClick={() => openDrawer(flow.id)}>
                    Editar
                  </button>
                  {flow.status === 'ENABLED' ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleFlow(flow.id, false)}>
                      Pausar
                    </button>
                  ) : (
                    <button className="btn btn-success btn-sm workflow-activate" onClick={() => toggleFlow(flow.id, true)}>
                      <Icon name="play" />
                      Activar
                    </button>
                  )}
                  {apConfigured && embedConfig && (
                    <a
                      href={`${embedConfig.baseUrl}/flows/${flow.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="workflow-linkout"
                    >
                      <Icon name="external" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="workflow-group">
        <header className="workflow-group-header">
          <div className="workflow-group-title">
            <span className="workflow-group-icon workflow-group-icon-blue">
              <Icon name="bolt" />
            </span>
            <span>Workflows IntegraX</span>
          </div>
        </header>

        <div className="workflow-group-body">
          {NATIVE_WORKFLOWS.map((workflow) => (
            <article key={workflow.id} className="native-flow-row">
              <div className="native-flow-copy">
                <div className="native-flow-heading">
                  <strong>{workflow.name}</strong>
                  <span className="badge badge-neutral">Inactivo</span>
                </div>
                <p>{workflow.description}</p>
                <div className="native-flow-meta">
                  <span>Ultima: Nunca</span>
                  <span>Trigger: {workflow.trigger}</span>
                </div>
              </div>

              <div className="native-flow-actions">
                <button className="btn btn-primary btn-sm">
                  <Icon name="eye" />
                  Ver
                </button>
                <button className="btn btn-success btn-sm workflow-activate">
                  <Icon name="play" />
                  Activar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {drawerFlowId !== undefined && embedConfig && (
        <ApDrawer embedConfig={embedConfig} flowId={drawerFlowId} onClose={() => setDrawerFlowId(undefined)} />
      )}
    </div>
  );
}

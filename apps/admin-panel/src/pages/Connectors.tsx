import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type ConnectorCategory =
  | 'payments'
  | 'invoicing'
  | 'erp'
  | 'messaging'
  | 'spreadsheets'
  | 'ecommerce';

type ConnectorCredential = {
  name: string;
  type: string;
  description: string;
  required: boolean;
};

type ConnectorAction = {
  name: string;
  description: string;
};

type ConnectorTrigger = {
  name: string;
  description: string;
  eventType: string;
};

type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ConnectorCategory;
  requiredCredentials: ConnectorCredential[];
  actions: ConnectorAction[];
  triggers: ConnectorTrigger[];
};

type ConnectorStatus = 'configured' | 'error' | 'available';

type TenantConnector = {
  id: string;
  connectorId: string;
  status: 'configured' | 'error' | 'pending' | 'disabled';
  lastTestedAt?: string | null;
  lastTestResult?: 'success' | 'failed' | null;
  definition?: ConnectorDefinition;
};

type ConnectorCard = {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ConnectorCategory;
  requiredCredentials: ConnectorCredential[];
  actions: ConnectorAction[];
  triggers: ConnectorTrigger[];
  configured: boolean;
  configurationId?: string;
  status: ConnectorStatus;
  lastTestedAt?: string | null;
  lastTestResult?: 'success' | 'failed' | null;
};

const MOCK_CONNECTORS: ConnectorCard[] = import.meta.env.PROD && !import.meta.env.VITE_ENABLE_DEMO_FALLBACKS
  ? []
  : [
      {
        id: 'mercadopago',
        name: 'MercadoPago',
        description: 'Pagos online en Argentina y LatAm',
        version: '1.0.0',
        category: 'payments',
        requiredCredentials: [
          { name: 'access_token', type: 'secret', description: 'Access Token', required: true },
        ],
        actions: [{ name: 'createPayment', description: 'Crear un pago' }],
        triggers: [{ name: 'payment.approved', description: 'Pago aprobado', eventType: 'payment.approved' }],
        configured: true,
        configurationId: 'tc_demo_mp',
        status: 'configured',
        lastTestResult: 'success',
      },
      {
        id: 'contabilium',
        name: 'Contabilium',
        description: 'ERP de gestion para PyMEs argentinas',
        version: '1.0.0',
        category: 'erp',
        requiredCredentials: [
          { name: 'api_key', type: 'secret', description: 'API Key', required: true },
        ],
        actions: [{ name: 'createInvoice', description: 'Crear factura' }],
        triggers: [],
        configured: false,
        status: 'available',
      },
      {
        id: 'email',
        name: 'Email (SMTP)',
        description: 'Envio de emails transaccionales',
        version: '1.0.0',
        category: 'messaging',
        requiredCredentials: [
          { name: 'smtp_host', type: 'string', description: 'Host SMTP', required: true },
        ],
        actions: [{ name: 'sendEmail', description: 'Enviar email' }],
        triggers: [],
        configured: true,
        configurationId: 'tc_demo_email',
        status: 'error',
        lastTestResult: 'failed',
      },
    ];

function categoryLabel(category: ConnectorCategory): string {
  switch (category) {
    case 'payments':
      return 'Pagos';
    case 'invoicing':
      return 'Facturacion';
    case 'erp':
      return 'ERP';
    case 'messaging':
      return 'Mensajeria';
    case 'spreadsheets':
      return 'Planillas';
    case 'ecommerce':
      return 'E-commerce';
    default:
      return category;
  }
}

function statusLabel(connector: ConnectorCard): string {
  if (!connector.configured) return 'Disponible';
  if (connector.status === 'error' || connector.lastTestResult === 'failed') return 'Error';
  return 'Conectado';
}

function statusBadgeClass(connector: ConnectorCard): string {
  if (!connector.configured) return 'badge-info';
  if (connector.status === 'error' || connector.lastTestResult === 'failed') return 'badge-error';
  return 'badge-success';
}

function buildConnectorCards(
  catalog: ConnectorDefinition[],
  configured: TenantConnector[],
): ConnectorCard[] {
  const configuredByConnectorId = new Map(configured.map(entry => [entry.connectorId, entry]));

  return catalog.map(definition => {
    const tenantConnector = configuredByConnectorId.get(definition.id);
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      category: definition.category,
      requiredCredentials: definition.requiredCredentials,
      actions: definition.actions,
      triggers: definition.triggers,
      configured: Boolean(tenantConnector),
      configurationId: tenantConnector?.id,
      status: tenantConnector
        ? tenantConnector.status === 'error'
          ? 'error'
          : 'configured'
        : 'available',
      lastTestedAt: tenantConnector?.lastTestedAt,
      lastTestResult: tenantConnector?.lastTestResult,
    };
  });
}

export function Connectors() {
  const [connectors, setConnectors] = useState<ConnectorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [catalogResponse, configuredResponse] = await Promise.all([
        fetchAdminJson<{ success: boolean; data: ConnectorDefinition[] }>('/api/connectors/catalog'),
        fetchAdminJson<{ success: boolean; data: TenantConnector[] }>('/api/connectors'),
      ]);

      setConnectors(buildConnectorCards(catalogResponse.data ?? [], configuredResponse.data ?? []));
    } catch (err) {
      if (allowDemoFallbacks) {
        setConnectors(MOCK_CONNECTORS);
        setError(null);
      } else {
        setConnectors([]);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los conectores');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const summary = useMemo(
    () => ({
      total: connectors.length,
      configured: connectors.filter(connector => connector.configured).length,
      errors: connectors.filter(
        connector => connector.configured && (connector.status === 'error' || connector.lastTestResult === 'failed'),
      ).length,
      available: connectors.filter(connector => !connector.configured).length,
    }),
    [connectors],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Conectores</h1>
          <p className="text-secondary">Catalogo unificado de integraciones y estado por tenant.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => void loadConnectors()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button className="btn btn-primary" disabled title="Se conecta en el siguiente slice con /api/connectors/learn">
            Aprender Nueva API
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Catalogo</span>
          <strong>{summary.total}</strong>
          <span className="text-secondary">Conectores disponibles</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Configurados</span>
          <strong>{summary.configured}</strong>
          <span className="text-secondary">Instancias activas del tenant</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Con Error</span>
          <strong>{summary.errors}</strong>
          <span className="text-secondary">Requieren revision operativa</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Disponibles</span>
          <strong>{summary.available}</strong>
          <span className="text-secondary">Listos para configurar</span>
        </div>
      </div>

      <div className="connector-grid">
        {loading && connectors.length === 0 ? (
          <div className="empty-state">Cargando conectores...</div>
        ) : connectors.length === 0 ? (
          <div className="empty-state">No hay conectores disponibles.</div>
        ) : (
          connectors.map(connector => (
            <div key={connector.id} className="connector-card">
              <div className="connector-header">
                <div className="connector-icon">{connector.name.slice(0, 2).toUpperCase()}</div>
                <div className="connector-info">
                  <h4>{connector.name}</h4>
                  <span className="text-xs text-muted">
                    {categoryLabel(connector.category)} • v{connector.version}
                  </span>
                </div>
                <span className={`badge ${statusBadgeClass(connector)}`}>{statusLabel(connector)}</span>
              </div>

              <p className="connector-description">{connector.description}</p>

              <div className="connector-metadata">
                <span>{connector.actions.length} acciones</span>
                <span>{connector.triggers.length} triggers</span>
                <span>{connector.requiredCredentials.filter(item => item.required).length} credenciales requeridas</span>
              </div>

              <div className="connector-actions">
                <Link className="btn btn-secondary btn-sm" to={`/connectors/${connector.id}`}>
                  Ver detalle
                </Link>
                {connector.configured ? (
                  <Link className="btn btn-primary btn-sm" to={`/connectors/${connector.id}`}>
                    Test / Estado
                  </Link>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled title="Configuracion guiada en el siguiente slice">
                    Configurar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


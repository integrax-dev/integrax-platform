import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

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
  category: string;
  requiredCredentials: ConnectorCredential[];
  actions: ConnectorAction[];
  triggers: ConnectorTrigger[];
};

type TenantConnector = {
  id: string;
  connectorId: string;
  status: 'configured' | 'error' | 'pending' | 'disabled';
  lastTestedAt?: string | null;
  lastTestResult?: 'success' | 'failed' | null;
  definition?: ConnectorDefinition;
};

type TestResponse = {
  success: boolean;
  data: {
    testResult: 'success' | 'failed';
    testedAt?: string | null;
    latencyMs?: number;
    message?: string;
  };
};

type ConfigureResponse = {
  success: boolean;
  data: {
    id: string;
    connectorId: string;
    status: 'configured' | 'error' | 'pending' | 'disabled';
    definition: ConnectorDefinition;
  };
};

const MOCK_DETAIL: Record<string, { definition: ConnectorDefinition; configured?: TenantConnector }> = {
  mercadopago: {
    definition: {
      id: 'mercadopago',
      name: 'MercadoPago',
      description: 'Pagos online en Argentina y LatAm',
      version: '1.0.0',
      category: 'payments',
      requiredCredentials: [{ name: 'access_token', type: 'secret', description: 'Access Token', required: true }],
      actions: [{ name: 'createPayment', description: 'Crear un pago' }],
      triggers: [{ name: 'payment.approved', description: 'Pago aprobado', eventType: 'payment.approved' }],
    },
    configured: {
      id: 'tc_demo_mp',
      connectorId: 'mercadopago',
      status: 'configured',
      lastTestResult: 'success',
    },
  },
};

function humanizeCategory(value: string): string {
  return value.replace(/-/g, ' ');
}

export function ConnectorDetail() {
  const { id } = useParams<{ id: string }>();
  const [definition, setDefinition] = useState<ConnectorDefinition | null>(null);
  const [configured, setConfigured] = useState<TenantConnector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const [definitionResponse, configuredResponse] = await Promise.all([
        fetchAdminJson<{ success: boolean; data: ConnectorDefinition }>(`/api/connectors/catalog/${id}`),
        fetchAdminJson<{ success: boolean; data: TenantConnector[] }>('/api/connectors'),
      ]);

      setDefinition(definitionResponse.data);
      setConfigured((configuredResponse.data ?? []).find(item => item.connectorId === id) ?? null);
    } catch (err) {
      if (allowDemoFallbacks && id && MOCK_DETAIL[id]) {
        setDefinition(MOCK_DETAIL[id].definition);
        setConfigured(MOCK_DETAIL[id].configured ?? null);
        setError(null);
      } else {
        setDefinition(null);
        setConfigured(null);
        setError(err instanceof Error ? err.message : 'No se pudo cargar el conector');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!definition) return;
    setFormValues(current => {
      const next = { ...current };
      for (const credential of definition.requiredCredentials) {
        next[credential.name] = next[credential.name] ?? '';
      }
      return next;
    });
  }, [definition]);

  const status = useMemo(() => {
    if (!configured) return 'Disponible';
    if (configured.status === 'error' || configured.lastTestResult === 'failed') return 'Error';
    return 'Conectado';
  }, [configured]);

  const runTest = useCallback(async () => {
    if (!configured?.id) return;
    setTesting(true);
    setTestMessage(null);

    try {
      const response = await fetchAdminJson<TestResponse>(`/api/connectors/${configured.id}/test`, {
        method: 'POST',
      });
      setConfigured(prev =>
        prev
          ? {
              ...prev,
              lastTestResult: response.data.testResult,
              lastTestedAt: response.data.testedAt ?? new Date().toISOString(),
              status: response.data.testResult === 'failed' ? 'error' : prev.status,
            }
          : prev,
      );
      setTestMessage(response.data.message ?? 'Test ejecutado');
    } catch (err) {
      if (allowDemoFallbacks) {
        setConfigured(prev => (prev ? { ...prev, lastTestResult: 'success' } : prev));
        setTestMessage('Test simulado correctamente');
      } else {
        setTestMessage(err instanceof Error ? err.message : 'No se pudo ejecutar el test');
      }
    } finally {
      setTesting(false);
    }
  }, [configured?.id]);

  const configureConnector = useCallback(async () => {
    if (!definition) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const credentials = Object.fromEntries(
        Object.entries(formValues)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value.length > 0),
      );

      const response = await fetchAdminJson<ConfigureResponse>('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorId: definition.id,
          credentials,
        }),
      });

      setConfigured({
        id: response.data.id,
        connectorId: response.data.connectorId,
        status: response.data.status,
        lastTestResult: configured?.lastTestResult ?? null,
        lastTestedAt: configured?.lastTestedAt ?? null,
      });
      setSaveMessage('Configuracion guardada correctamente');
    } catch (err) {
      if (allowDemoFallbacks) {
        setConfigured({
          id: configured?.id ?? `mock-${definition.id}`,
          connectorId: definition.id,
          status: 'configured',
          lastTestResult: configured?.lastTestResult ?? null,
          lastTestedAt: configured?.lastTestedAt ?? null,
        });
        setSaveMessage('Configuracion simulada correctamente');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la configuracion');
      }
    } finally {
      setSaving(false);
    }
  }, [allowDemoFallbacks, configured?.id, configured?.lastTestResult, configured?.lastTestedAt, definition, formValues]);

  if (loading) {
    return <div className="page"><div className="empty-state">Cargando detalle del conector...</div></div>;
  }

  if (!definition) {
    return (
      <div className="page">
        <div className="alert alert-error">{error ?? 'Conector no encontrado'}</div>
        <Link className="btn btn-secondary btn-sm" to="/connectors">Volver a conectores</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{definition.name}</h1>
          <p className="text-secondary">{definition.description}</p>
        </div>
        <div className="action-buttons">
          <Link className="btn btn-secondary btn-sm" to="/connectors">Volver</Link>
          {configured ? (
            <button className="btn btn-primary btn-sm" onClick={() => void runTest()} disabled={testing}>
              {testing ? 'Testeando...' : 'Testear'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => void configureConnector()} disabled={saving}>
              {saving ? 'Guardando...' : 'Configurar'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {testMessage && <div className="alert alert-info">{testMessage}</div>}
      {saveMessage && <div className="alert alert-success">{saveMessage}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Estado</span>
          <strong>{status}</strong>
          <span className="text-secondary">{configured ? 'Configurado para este tenant' : 'Disponible en catalogo'}</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Categoria</span>
          <strong>{humanizeCategory(definition.category)}</strong>
          <span className="text-secondary">Version {definition.version}</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Acciones</span>
          <strong>{definition.actions.length}</strong>
          <span className="text-secondary">Operaciones disponibles</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Triggers</span>
          <strong>{definition.triggers.length}</strong>
          <span className="text-secondary">Eventos soportados</span>
        </div>
      </div>

      <div className="connector-detail-grid">
        <div className="card">
          <h3>{configured ? 'Reconfigurar conector' : 'Configurar conector'}</h3>
          <p className="text-secondary">
            Completa las credenciales requeridas para instanciar este conector en el tenant actual.
          </p>
          <div className="connector-config-form">
            {definition.requiredCredentials.map(item => (
              <div key={item.name} className="form-group">
                <label className="label" htmlFor={`credential-${item.name}`}>
                  {item.name}
                  {item.required ? ' *' : ''}
                </label>
                {item.type === 'file' ? (
                  <textarea
                    id={`credential-${item.name}`}
                    className="input"
                    rows={4}
                    placeholder={item.description}
                    value={formValues[item.name] ?? ''}
                    onChange={event =>
                      setFormValues(current => ({ ...current, [item.name]: event.target.value }))
                    }
                  />
                ) : (
                  <input
                    id={`credential-${item.name}`}
                    className="input"
                    type={item.type === 'secret' ? 'password' : 'text'}
                    placeholder={item.description}
                    value={formValues[item.name] ?? ''}
                    onChange={event =>
                      setFormValues(current => ({ ...current, [item.name]: event.target.value }))
                    }
                  />
                )}
                <span className="text-secondary text-sm">{item.description}</span>
              </div>
            ))}
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => void configureConnector()} disabled={saving}>
                {saving ? 'Guardando...' : configured ? 'Guardar cambios' : 'Guardar configuracion'}
              </button>
              {configured && (
                <button className="btn btn-secondary" onClick={() => void runTest()} disabled={testing}>
                  {testing ? 'Testeando...' : 'Guardar y testear despues'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Credenciales requeridas</h3>
          <div className="connector-detail-list">
            {definition.requiredCredentials.map(item => (
              <div key={item.name} className="connector-detail-item">
                <div>
                  <strong>{item.name}</strong>
                  <p className="text-secondary">{item.description}</p>
                </div>
                <div className="connector-detail-tags">
                  <span className="badge badge-info">{item.type}</span>
                  {item.required && <span className="badge badge-error">required</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Estado operativo</h3>
          <div className="connector-detail-list">
            <div className="connector-detail-item">
              <strong>Configuracion</strong>
              <span className={`badge ${configured ? 'badge-success' : 'badge-info'}`}>
                {configured ? 'Instanciado' : 'Solo catalogo'}
              </span>
            </div>
            <div className="connector-detail-item">
              <strong>Ultimo test</strong>
              <span className="text-secondary">
                {configured?.lastTestedAt ? new Date(configured.lastTestedAt).toLocaleString('es-AR') : 'Nunca'}
              </span>
            </div>
            <div className="connector-detail-item">
              <strong>Resultado</strong>
              <span className={`badge ${
                configured?.lastTestResult === 'failed'
                  ? 'badge-error'
                  : configured?.lastTestResult === 'success'
                    ? 'badge-success'
                    : 'badge-info'
              }`}>
                {configured?.lastTestResult ?? 'sin test'}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Acciones</h3>
          <div className="connector-detail-list">
            {definition.actions.map(action => (
              <div key={action.name} className="connector-detail-item">
                <div>
                  <strong>{action.name}</strong>
                  <p className="text-secondary">{action.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Triggers</h3>
          <div className="connector-detail-list">
            {definition.triggers.length === 0 ? (
              <div className="empty-state">Este conector no expone triggers todavia.</div>
            ) : (
              definition.triggers.map(trigger => (
                <div key={trigger.name} className="connector-detail-item">
                  <div>
                    <strong>{trigger.name}</strong>
                    <p className="text-secondary">{trigger.description}</p>
                  </div>
                  <code>{trigger.eventType}</code>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

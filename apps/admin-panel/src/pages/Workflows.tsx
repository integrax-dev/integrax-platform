import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type Flow = {
  id: string;
  name: string;
  tenantId: string;
  enabled: boolean;
};

const MOCK_FLOWS: Flow[] = import.meta.env.PROD && !import.meta.env.VITE_ENABLE_DEMO_FALLBACKS
  ? []
  : [
      { id: 'flow-mp-invoice', name: 'Facturar Pago MercadoPago', tenantId: 'ten_mvp_demo', enabled: true },
      { id: 'flow-order-notify', name: 'Notificar Orden Nueva', tenantId: 'ten_mvp_demo', enabled: true },
      { id: 'flow-stock-sync', name: 'Sincronizar Stock', tenantId: 'ten_mvp_demo', enabled: false },
    ];

export function Workflows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminJson<{ success: boolean; data: Flow[] }>('/api/workflows');
      setFlows(response.data ?? []);
    } catch (err) {
      if (allowDemoFallbacks) {
        setFlows(MOCK_FLOWS);
        setError(null);
      } else {
        setFlows([]);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los workflows');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  const summary = useMemo(
    () => ({
      total: flows.length,
      enabled: flows.filter(flow => flow.enabled).length,
      disabled: flows.filter(flow => !flow.enabled).length,
    }),
    [flows],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Workflows</h1>
          <p className="text-secondary">Flows ejecutables del tenant actual sobre el integration engine.</p>
        </div>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => void loadFlows()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button className="btn btn-primary" disabled title="Workflow registry editable en el siguiente slice">
            Nuevo Workflow
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Total</span>
          <strong>{summary.total}</strong>
          <span className="text-secondary">Flows visibles para el tenant</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Activos</span>
          <strong>{summary.enabled}</strong>
          <span className="text-secondary">Listos para ejecutar</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Pausados</span>
          <strong>{summary.disabled}</strong>
          <span className="text-secondary">Requieren activacion</span>
        </div>
      </div>

      <div className="workflow-list">
        {loading && flows.length === 0 ? (
          <div className="empty-state">Cargando workflows...</div>
        ) : flows.length === 0 ? (
          <div className="empty-state">No hay workflows visibles para este tenant.</div>
        ) : (
          flows.map(flow => (
            <div key={flow.id} className="workflow-card">
              <div className="workflow-header">
                <div>
                  <h4>{flow.name}</h4>
                  <span className="text-xs text-muted">{flow.id}</span>
                </div>
                <span className={`badge ${flow.enabled ? 'badge-success' : 'badge-warning'}`}>
                  {flow.enabled ? 'Activo' : 'Pausado'}
                </span>
              </div>

              <div className="workflow-trigger">
                Tenant: <code>{flow.tenantId}</code>
              </div>

              <div className="connector-actions">
                <Link className="btn btn-secondary btn-sm" to={`/workflows/${flow.id}`}>
                  Ver detalle
                </Link>
                <Link className="btn btn-primary btn-sm" to={`/workflows/${flow.id}`}>
                  Ejecutar / Estado
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


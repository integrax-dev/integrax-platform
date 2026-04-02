import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type Flow = {
  id: string;
  name: string;
  tenantId: string;
  enabled: boolean;
};

type TriggerRunResponse = {
  success: boolean;
  data: {
    runId: string;
  };
};

type RunStatus = {
  runId: string;
  status: 'running' | 'succeeded' | 'failed' | 'paused';
  startedAt: string;
  finishedAt?: string;
  output?: {
    result?: unknown;
    error?: string;
  };
};

const MOCK_FLOWS: Record<string, Flow> = {
  'flow-mp-invoice': { id: 'flow-mp-invoice', name: 'Facturar Pago MercadoPago', tenantId: 'ten_mvp_demo', enabled: true },
};

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'enable' | 'disable' | 'trigger' | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [payload, setPayload] = useState('{\n  "source": "admin-panel"\n}');

  const loadFlow = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminJson<{ success: boolean; data: Flow[] }>('/api/workflows');
      const found = (response.data ?? []).find(item => item.id === id) ?? null;
      if (!found) {
        throw new Error('WORKFLOW_NOT_FOUND');
      }
      setFlow(found);
    } catch (err) {
      if (allowDemoFallbacks && id && MOCK_FLOWS[id]) {
        setFlow(MOCK_FLOWS[id]);
        setError(null);
      } else {
        setFlow(null);
        setError(err instanceof Error ? err.message : 'No se pudo cargar el workflow');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadFlow();
  }, [loadFlow]);

  const toggleFlow = useCallback(async (nextEnabled: boolean) => {
    if (!flow) return;
    setBusyAction(nextEnabled ? 'enable' : 'disable');
    setActionMessage(null);

    try {
      await fetchAdminJson(`/api/workflows/${flow.id}/${nextEnabled ? 'enable' : 'disable'}`, {
        method: 'PATCH',
      });
      setFlow(prev => (prev ? { ...prev, enabled: nextEnabled } : prev));
      setActionMessage(nextEnabled ? 'Workflow activado' : 'Workflow pausado');
    } catch (err) {
      if (allowDemoFallbacks) {
        setFlow(prev => (prev ? { ...prev, enabled: nextEnabled } : prev));
        setActionMessage(nextEnabled ? 'Workflow activado (simulado)' : 'Workflow pausado (simulado)');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo actualizar el workflow');
      }
    } finally {
      setBusyAction(null);
    }
  }, [flow]);

  const triggerFlow = useCallback(async () => {
    if (!flow) return;
    setBusyAction('trigger');
    setActionMessage(null);

    try {
      const parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      const response = await fetchAdminJson<TriggerRunResponse>(`/api/workflows/${flow.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedPayload),
      });
      setLastRunId(response.data.runId);
      setActionMessage('Workflow disparado manualmente');
    } catch (err) {
      if (allowDemoFallbacks) {
        setLastRunId(`run-${flow.id}-demo`);
        setActionMessage('Workflow disparado (simulado)');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo ejecutar el workflow');
      }
    } finally {
      setBusyAction(null);
    }
  }, [flow, payload]);

  const loadRunStatus = useCallback(async () => {
    if (!flow || !lastRunId) return;
    setActionMessage(null);

    try {
      const response = await fetchAdminJson<{ success: boolean; data: RunStatus }>(
        `/api/workflows/${flow.id}/runs/${lastRunId}`,
      );
      setRunStatus(response.data);
    } catch (err) {
      if (allowDemoFallbacks) {
        setRunStatus({
          runId: lastRunId,
          status: 'succeeded',
          startedAt: new Date(Date.now() - 10_000).toISOString(),
          finishedAt: new Date().toISOString(),
          output: { result: { ok: true } },
        });
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el run');
      }
    }
  }, [flow, lastRunId]);

  const statusLabel = useMemo(() => {
    if (!flow) return '';
    return flow.enabled ? 'Activo' : 'Pausado';
  }, [flow]);

  if (loading) {
    return <div className="page"><div className="empty-state">Cargando workflow...</div></div>;
  }

  if (!flow) {
    return (
      <div className="page">
        <div className="alert alert-error">{error ?? 'Workflow no encontrado'}</div>
        <Link className="btn btn-secondary btn-sm" to="/workflows">Volver a workflows</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{flow.name}</h1>
          <p className="text-secondary">Detalle operativo del flow expuesto por el integration engine.</p>
        </div>
        <div className="action-buttons">
          <Link className="btn btn-secondary btn-sm" to="/workflows">Volver</Link>
          {flow.enabled ? (
            <button className="btn btn-secondary btn-sm" onClick={() => void toggleFlow(false)} disabled={busyAction !== null}>
              {busyAction === 'disable' ? 'Pausando...' : 'Pausar'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => void toggleFlow(true)} disabled={busyAction !== null}>
              {busyAction === 'enable' ? 'Activando...' : 'Activar'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionMessage && <div className="alert alert-info">{actionMessage}</div>}

      <div className="stats-grid compact-stats-grid">
        <div className="stat-surface">
          <span className="stat-kicker">Estado</span>
          <strong>{statusLabel}</strong>
          <span className="text-secondary">Enabled: {flow.enabled ? 'true' : 'false'}</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Flow ID</span>
          <strong>{flow.id}</strong>
          <span className="text-secondary">Identificador del engine</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Tenant</span>
          <strong>{flow.tenantId}</strong>
          <span className="text-secondary">Scope actual</span>
        </div>
        <div className="stat-surface">
          <span className="stat-kicker">Ultimo Run</span>
          <strong>{lastRunId ?? 'N/A'}</strong>
          <span className="text-secondary">Se completa luego de trigger manual</span>
        </div>
      </div>

      <div className="connector-detail-grid">
        <div className="card">
          <h3>Trigger manual</h3>
          <div className="connector-config-form">
            <div className="form-group">
              <label className="label" htmlFor="workflow-payload">Payload JSON</label>
              <textarea
                id="workflow-payload"
                className="input"
                rows={8}
                value={payload}
                onChange={event => setPayload(event.target.value)}
              />
            </div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => void triggerFlow()} disabled={busyAction !== null || !flow.enabled}>
                {busyAction === 'trigger' ? 'Ejecutando...' : 'Ejecutar ahora'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Run status</h3>
          <div className="connector-detail-list">
            <div className="connector-detail-item">
              <strong>Ultimo runId</strong>
              <span className="text-secondary">{lastRunId ?? 'No ejecutado aun'}</span>
            </div>
            <div className="connector-detail-item">
              <strong>Estado</strong>
              <span className={`badge ${
                runStatus?.status === 'failed'
                  ? 'badge-error'
                  : runStatus?.status === 'succeeded'
                    ? 'badge-success'
                    : 'badge-info'
              }`}>
                {runStatus?.status ?? 'sin datos'}
              </span>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={() => void loadRunStatus()} disabled={!lastRunId}>
                Consultar run
              </button>
            </div>
            {runStatus && (
              <div className="connector-detail-item">
                <div>
                  <strong>Detalle</strong>
                  <p className="text-secondary">
                    Inicio: {new Date(runStatus.startedAt).toLocaleString('es-AR')}
                  </p>
                  {runStatus.finishedAt && (
                    <p className="text-secondary">
                      Fin: {new Date(runStatus.finishedAt).toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
                <code>{JSON.stringify(runStatus.output ?? {}, null, 2)}</code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


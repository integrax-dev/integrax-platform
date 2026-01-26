import { useState } from 'react';
import './Pages.css';

const mockWorkflows = [
  {
    id: 'wf_001',
    name: 'Facturar Pago MercadoPago',
    status: 'active',
    version: 3,
    trigger: { type: 'webhook', connector: 'mercadopago', event: 'payment.approved' },
    steps: ['AFIP crear factura', 'Email enviar', 'Sheets registrar'],
    runs: { total: 1250, success: 1230, failed: 20 },
  },
  {
    id: 'wf_002',
    name: 'Notificar Orden Nueva',
    status: 'active',
    version: 1,
    trigger: { type: 'webhook', connector: 'tiendanube', event: 'order.created' },
    steps: ['WhatsApp notificar', 'Sheets registrar'],
    runs: { total: 456, success: 450, failed: 6 },
  },
  {
    id: 'wf_003',
    name: 'Sincronizar Stock',
    status: 'paused',
    version: 2,
    trigger: { type: 'schedule', cron: '0 */6 * * *' },
    steps: ['Contabilium obtener productos', 'TiendaNube actualizar stock'],
    runs: { total: 120, success: 115, failed: 5 },
  },
];

export function Workflows() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Workflows</h1>
          <p className="text-secondary">Automatizaciones entre conectores</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nuevo Workflow
        </button>
      </div>

      <div className="workflow-list">
        {mockWorkflows.map((workflow) => (
          <div key={workflow.id} className="workflow-card">
            <div className="workflow-header">
              <div>
                <h4>{workflow.name}</h4>
                <span className="text-xs text-muted">v{workflow.version} • {workflow.id}</span>
              </div>
              <span className={`badge badge-${workflow.status === 'active' ? 'success' : 'warning'}`}>
                {workflow.status === 'active' ? '● Activo' : '◐ Pausado'}
              </span>
            </div>

            <div className="workflow-trigger">
              {workflow.trigger.type === 'webhook' ? (
                <>📨 Webhook: {workflow.trigger.connector} → {workflow.trigger.event}</>
              ) : (
                <>⏰ Schedule: {workflow.trigger.cron}</>
              )}
            </div>

            <div className="workflow-steps">
              {workflow.steps.map((step, i) => (
                <>
                  <span key={i} className="workflow-step">{step}</span>
                  {i < workflow.steps.length - 1 && <span className="workflow-arrow">→</span>}
                </>
              ))}
            </div>

            <div className="workflow-stats">
              <span className="text-sm">
                <span className="text-success">{workflow.runs.success}</span> éxitos •{' '}
                <span className="text-error">{workflow.runs.failed}</span> fallos
              </span>
            </div>

            <div className="connector-actions">
              <button className="btn btn-secondary btn-sm">Editar</button>
              <button className="btn btn-secondary btn-sm">Ver Runs</button>
              {workflow.status === 'active' ? (
                <button className="btn btn-secondary btn-sm">Pausar</button>
              ) : (
                <button className="btn btn-primary btn-sm">Activar</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo Workflow</h2>
            <form className="modal-form">
              <div className="form-group">
                <label className="label">Nombre</label>
                <input className="input" placeholder="ej: Facturar pago" />
              </div>
              <div className="form-group">
                <label className="label">Trigger</label>
                <select className="input">
                  <option value="webhook">Webhook (evento externo)</option>
                  <option value="schedule">Schedule (programado)</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Descripción</label>
                <input className="input" placeholder="Describe qué hace este workflow" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

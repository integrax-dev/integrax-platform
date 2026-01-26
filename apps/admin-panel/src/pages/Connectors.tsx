import { useState } from 'react';
import './Pages.css';

const connectorCatalog = [
  { id: 'mercadopago', name: 'MercadoPago', icon: '💳', category: 'Pagos', configured: true, status: 'connected' },
  { id: 'afip-wsfe', name: 'AFIP Factura Electrónica', icon: '🧾', category: 'Facturación', configured: true, status: 'connected' },
  { id: 'contabilium', name: 'Contabilium', icon: '📊', category: 'ERP', configured: false, status: 'available' },
  { id: 'whatsapp', name: 'WhatsApp Business', icon: '💬', category: 'Mensajería', configured: true, status: 'connected' },
  { id: 'email', name: 'Email SMTP', icon: '📧', category: 'Mensajería', configured: true, status: 'error' },
  { id: 'google-sheets', name: 'Google Sheets', icon: '📑', category: 'Planillas', configured: false, status: 'available' },
  { id: 'tiendanube', name: 'Tienda Nube', icon: '🛒', category: 'E-commerce', configured: false, status: 'available' },
];

export function Connectors() {
  const [showLearnModal, setShowLearnModal] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Conectores</h1>
          <p className="text-secondary">Configura integraciones con servicios externos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLearnModal(true)}>
          🧠 Aprender Nueva API
        </button>
      </div>

      <div className="connector-grid">
        {connectorCatalog.map((connector) => (
          <div key={connector.id} className="connector-card">
            <div className="connector-header">
              <div className="connector-icon">{connector.icon}</div>
              <div className="connector-info">
                <h4>{connector.name}</h4>
                <span className="text-xs text-muted">{connector.category}</span>
              </div>
              <span className={`badge badge-${
                connector.status === 'connected' ? 'success' :
                connector.status === 'error' ? 'error' : 'info'
              }`}>
                {connector.status === 'connected' ? '● Conectado' :
                 connector.status === 'error' ? '● Error' : '○ Disponible'}
              </span>
            </div>

            <div className="connector-actions">
              {connector.configured ? (
                <>
                  <button className="btn btn-secondary btn-sm">Configurar</button>
                  <button className="btn btn-secondary btn-sm">Test</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm">Configurar</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showLearnModal && (
        <div className="modal-overlay" onClick={() => setShowLearnModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🧠 Aprender Nueva API</h2>
            <p className="text-secondary mb-md">
              El LLM analizará la documentación y generará un conector completo automáticamente.
            </p>
            <form className="modal-form">
              <div className="form-group">
                <label className="label">Nombre de la API</label>
                <input className="input" placeholder="ej: Stripe, MercadoLibre, Rappi" />
              </div>
              <div className="form-group">
                <label className="label">URL de Documentación</label>
                <input className="input" placeholder="https://docs.example.com/api" />
              </div>
              <div className="form-group">
                <label className="label">Tipo de Documentación</label>
                <select className="input">
                  <option value="openapi">OpenAPI / Swagger</option>
                  <option value="html">Página HTML</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLearnModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  🚀 Iniciar Aprendizaje
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

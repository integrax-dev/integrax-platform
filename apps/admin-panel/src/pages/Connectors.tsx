import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Pages.css';

const connectorCatalog = [
  { id: 'mercadopago',   name: 'MercadoPago',              icon: '💳', category: 'Payments',   configured: true,  status: 'connected' },
  { id: 'afip-wsfe',     name: 'AFIP Factura Electrónica', icon: '🧾', category: 'Billing',    configured: true,  status: 'connected' },
  { id: 'contabilium',   name: 'Contabilium',              icon: '📊', category: 'ERP',        configured: false, status: 'available' },
  { id: 'whatsapp',      name: 'WhatsApp Business',        icon: '💬', category: 'Messaging',  configured: true,  status: 'connected' },
  { id: 'email',         name: 'Email SMTP',               icon: '📧', category: 'Messaging',  configured: true,  status: 'error' },
  { id: 'google-sheets', name: 'Google Sheets',            icon: '📑', category: 'Sheets',     configured: false, status: 'available' },
  { id: 'tiendanube',    name: 'Tienda Nube',              icon: '🛒', category: 'E-commerce', configured: false, status: 'available' },
];

export function Connectors() {
  const { t } = useTranslation();
  const [showLearnModal, setShowLearnModal] = useState(false);

  const statusLabel = (status: string) => {
    if (status === 'connected') return `● ${t('connectors.connectedLabel') ?? 'Connected'}`;
    if (status === 'error') return `● ${t('common.error')}`;
    return `○ Available`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('connectors.title')}</h1>
          <p className="text-secondary">{t('connectors.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLearnModal(true)}>
          🧠 {t('connectors.learnApi') ?? 'Learn New API'}
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
                {statusLabel(connector.status)}
              </span>
            </div>

            <div className="connector-actions">
              {connector.configured ? (
                <>
                  <button className="btn btn-secondary btn-sm">{t('common.edit')}</button>
                  <button className="btn btn-secondary btn-sm">{t('connectors.test')}</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm">{t('connectors.configure') ?? 'Configure'}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showLearnModal && (
        <div className="modal-overlay" onClick={() => setShowLearnModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🧠 {t('connectors.learnApi') ?? 'Learn New API'}</h2>
            <p className="text-secondary mb-md">
              {t('connectors.learnApiDesc') ?? 'The LLM will analyze the documentation and auto-generate a complete connector.'}
            </p>
            <form className="modal-form">
              <div className="form-group">
                <label className="label">API Name</label>
                <input className="input" placeholder="e.g. Stripe, MercadoLibre, Rappi" />
              </div>
              <div className="form-group">
                <label className="label">Documentation URL</label>
                <input className="input" placeholder="https://docs.example.com/api" />
              </div>
              <div className="form-group">
                <label className="label">Documentation Type</label>
                <select className="input">
                  <option value="openapi">OpenAPI / Swagger</option>
                  <option value="html">HTML Page</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLearnModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  🚀 {t('connectors.startLearning') ?? 'Start Learning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

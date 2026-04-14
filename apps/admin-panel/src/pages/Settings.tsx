import { useTranslation } from 'react-i18next';
import './Pages.css';

export function Settings() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="text-secondary">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>API Keys</h3>
          <p className="text-secondary text-sm mb-md">
            Manage API keys for programmatic access
          </p>

          <div className="api-key-item">
            <div>
              <span className="font-medium">Production API Key</span>
              <br />
              <code className="text-xs">ixk_prod_****...****abc123</code>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary btn-sm">Copy</button>
              <button className="btn btn-secondary btn-sm">Rotate</button>
            </div>
          </div>

          <div className="api-key-item">
            <div>
              <span className="font-medium">Test API Key</span>
              <br />
              <code className="text-xs">ixk_test_****...****xyz789</code>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary btn-sm">Copy</button>
              <button className="btn btn-secondary btn-sm">Rotate</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Webhooks</h3>
          <p className="text-secondary text-sm mb-md">
            Incoming webhook configuration
          </p>

          <div className="form-group">
            <label className="label">Webhook URL</label>
            <input
              className="input"
              value="https://api.integrax.io/webhooks/ten_001"
              readOnly
            />
          </div>

          <div className="form-group">
            <label className="label">Signing Secret</label>
            <div className="flex gap-sm">
              <input
                className="input"
                type="password"
                value="whsec_xxxxxxxxxxxx"
                readOnly
              />
              <button className="btn btn-secondary">Show</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Plan Limits</h3>
          <p className="text-secondary text-sm mb-md">
            Current plan: <span className="badge badge-info">Professional</span>
          </p>

          <div className="limit-item">
            <span>Requests per minute</span>
            <span className="font-medium">500 / 500</span>
          </div>
          <div className="limit-item">
            <span>Jobs per minute</span>
            <span className="font-medium">850 / 1000</span>
          </div>
          <div className="limit-item">
            <span>Active workflows</span>
            <span className="font-medium">12 / 50</span>
          </div>
          <div className="limit-item">
            <span>{t('nav.connectors')}</span>
            <span className="font-medium">6 / 20</span>
          </div>
          <div className="limit-item">
            <span>Data retention</span>
            <span className="font-medium">90 days</span>
          </div>

          <button className="btn btn-primary mt-md">Upgrade Plan</button>
        </div>

        <div className="card">
          <h3>{t('settings.notifications')}</h3>
          <p className="text-secondary text-sm mb-md">
            Configure alerts and notifications
          </p>

          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Email when a workflow fails</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Email when 80% of limit is reached</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" />
              <span>Daily summary email</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Security alerts</span>
            </label>
          </div>

          <button className="btn btn-secondary mt-md">{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

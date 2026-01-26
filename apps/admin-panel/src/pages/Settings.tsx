import './Pages.css';

export function Settings() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p className="text-secondary">Configuración de la plataforma</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>API Keys</h3>
          <p className="text-secondary text-sm mb-md">
            Gestiona las API keys para acceso programático
          </p>

          <div className="api-key-item">
            <div>
              <span className="font-medium">Production API Key</span>
              <br />
              <code className="text-xs">ixk_prod_****...****abc123</code>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary btn-sm">Copiar</button>
              <button className="btn btn-secondary btn-sm">Rotar</button>
            </div>
          </div>

          <div className="api-key-item">
            <div>
              <span className="font-medium">Test API Key</span>
              <br />
              <code className="text-xs">ixk_test_****...****xyz789</code>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary btn-sm">Copiar</button>
              <button className="btn btn-secondary btn-sm">Rotar</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Webhooks</h3>
          <p className="text-secondary text-sm mb-md">
            Configuración de webhooks entrantes
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
              <button className="btn btn-secondary">Ver</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Límites del Plan</h3>
          <p className="text-secondary text-sm mb-md">
            Tu plan actual: <span className="badge badge-info">Professional</span>
          </p>

          <div className="limit-item">
            <span>Requests por minuto</span>
            <span className="font-medium">500 / 500</span>
          </div>
          <div className="limit-item">
            <span>Jobs por minuto</span>
            <span className="font-medium">850 / 1000</span>
          </div>
          <div className="limit-item">
            <span>Workflows activos</span>
            <span className="font-medium">12 / 50</span>
          </div>
          <div className="limit-item">
            <span>Conectores</span>
            <span className="font-medium">6 / 20</span>
          </div>
          <div className="limit-item">
            <span>Retención de datos</span>
            <span className="font-medium">90 días</span>
          </div>

          <button className="btn btn-primary mt-md">Upgrade Plan</button>
        </div>

        <div className="card">
          <h3>Notificaciones</h3>
          <p className="text-secondary text-sm mb-md">
            Configura alertas y notificaciones
          </p>

          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Email cuando un workflow falla</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Email cuando se alcanza 80% del límite</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" />
              <span>Email resumen diario</span>
            </label>
          </div>
          <div className="notification-item">
            <label className="flex items-center gap-md">
              <input type="checkbox" defaultChecked />
              <span>Alertas de seguridad</span>
            </label>
          </div>

          <button className="btn btn-secondary mt-md">Guardar</button>
        </div>
      </div>
    </div>
  );
}

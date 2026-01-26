import { useState } from 'react';
import './Pages.css';

const mockTenants = [
  { id: 'ten_001', name: 'Tienda ABC', plan: 'professional', status: 'active', events: 4521, created: '2024-01-15' },
  { id: 'ten_002', name: 'Empresa XYZ', plan: 'enterprise', status: 'active', events: 12340, created: '2024-01-10' },
  { id: 'ten_003', name: 'Negocio 123', plan: 'starter', status: 'active', events: 890, created: '2024-02-01' },
  { id: 'ten_004', name: 'Shop Online', plan: 'professional', status: 'suspended', events: 2100, created: '2024-01-20' },
  { id: 'ten_005', name: 'Mi PyME', plan: 'free', status: 'active', events: 156, created: '2024-02-10' },
];

export function Tenants() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tenants</h1>
          <p className="text-secondary">Gestión de clientes de la plataforma</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nuevo Tenant
        </button>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Eventos (mes)</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {mockTenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <div className="tenant-name">
                    <span className="tenant-avatar">
                      {tenant.name.charAt(0)}
                    </span>
                    <div>
                      <span className="font-medium">{tenant.name}</span>
                      <br />
                      <span className="text-xs text-muted">{tenant.id}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge badge-${tenant.plan === 'enterprise' ? 'info' : tenant.plan === 'professional' ? 'success' : 'warning'}`}>
                    {tenant.plan}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-${tenant.status === 'active' ? 'success' : 'error'}`}>
                    {tenant.status === 'active' ? '● Activo' : '○ Suspendido'}
                  </span>
                </td>
                <td>{tenant.events.toLocaleString()}</td>
                <td className="text-muted">{tenant.created}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-secondary btn-sm">Editar</button>
                    <button className="btn btn-secondary btn-sm">Ver</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo Tenant</h2>
            <form className="modal-form">
              <div className="form-group">
                <label className="label">Nombre</label>
                <input className="input" placeholder="Nombre del tenant" />
              </div>
              <div className="form-group">
                <label className="label">Email del Owner</label>
                <input className="input" type="email" placeholder="admin@empresa.com" />
              </div>
              <div className="form-group">
                <label className="label">Plan</label>
                <select className="input">
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

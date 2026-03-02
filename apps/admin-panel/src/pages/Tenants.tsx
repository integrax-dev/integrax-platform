import { useState, useEffect } from 'react';
import './Pages.css';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';


type Tenant = {
  id: string;
  name: string;
  plan: string;
  status: string;
  events: number;
  created: string;
};

const MOCK_TENANTS: Tenant[] = [
  { id: 'tn-acme', name: 'Acme SA', plan: 'enterprise', status: 'active', events: 320450, created: '2025-11-12' },
  { id: 'tn-globex', name: 'Globex', plan: 'professional', status: 'active', events: 124300, created: '2025-08-01' },
  { id: 'tn-umbrella', name: 'Umbrella', plan: 'starter', status: 'suspended', events: 12040, created: '2025-05-19' },
];

export function Tenants() {
  const [showModal, setShowModal] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAdminJson<{ tenants: Tenant[] }>('/api/admin/tenants');
        if (!cancelled) setTenants(data.tenants || []);
      } catch {
        if (allowDemoFallbacks) {
          if (!cancelled) {
            setTenants(MOCK_TENANTS);
            setError(null);
          }
        } else if (!cancelled) {
          setError('No se pudo cargar tenants');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

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
            {loading ? (
              <tr><td colSpan={6}>Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={6} style={{color:'red'}}>{error}</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={6}>No hay tenants</td></tr>
            ) : tenants.map((tenant) => (
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import './Pages.css';
import { fetchAdminJson } from '../lib/adminApi';
import { useAuthStore } from '../stores/auth';
import { usePlatformStream, type PlatformEvent } from '../lib/usePlatformStream';
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newPlan, setNewPlan] = useState('starter');

  // ── Real-time stream ──────────────────────────────────────────────────────
  const getToken = useCallback(() => useAuthStore.getState().token, []);

  usePlatformStream({
    getToken,
    handlers: useMemo(() => ({
      'tenant.created': (env: PlatformEvent) => {
        const t = env.data as Tenant & { createdAt?: string };
        setTenants(prev => {
          if (prev.find(x => x.id === t.id)) return prev;
          return [{
            id: t.id,
            name: t.name,
            plan: t.plan ?? 'starter',
            status: t.status ?? 'active',
            events: 0,
            created: t.createdAt ? t.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
          }, ...prev];
        });
      },
      'tenant.updated': (env: PlatformEvent) => {
        const t = env.data as Partial<Tenant> & { id: string };
        setTenants(prev => prev.map(x =>
          x.id === t.id ? { ...x, ...t } : x,
        ));
      },
      'tenant.suspended': (env: PlatformEvent) => {
        const t = env.data as { id: string };
        setTenants(prev => prev.map(x =>
          x.id === t.id ? { ...x, status: 'suspended' } : x,
        ));
      },
      'tenant.activated': (env: PlatformEvent) => {
        const t = env.data as { id: string };
        setTenants(prev => prev.map(x =>
          x.id === t.id ? { ...x, status: 'active' } : x,
        ));
      },
    }), []),
  });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    setCreating(true);
    try {
      await fetchAdminJson('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, ownerEmail: newEmail, ownerName: newOwnerName || newName, plan: newPlan }),
      });
      setShowModal(false);
      setNewName('');
      setNewEmail('');
      setNewOwnerName('');
      setNewPlan('starter');
      // SSE tenant.created event will prepend the new tenant automatically
    } catch {
      // Keep modal open on error so the user can retry
    } finally {
      setCreating(false);
    }
  };

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
            <form className="modal-form" onSubmit={handleCreate}>
              <div className="form-group">
                <label className="label">Nombre</label>
                <input
                  className="input"
                  placeholder="Nombre del tenant"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Nombre del Owner</label>
                <input
                  className="input"
                  placeholder="Nombre completo"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Email del Owner</label>
                <input
                  className="input"
                  type="email"
                  placeholder="admin@empresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Plan</label>
                <select className="input" value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
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
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creando...' : 'Crear Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

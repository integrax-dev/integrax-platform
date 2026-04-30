import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';
import './ConsistencyRules.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToleranceStrategy = 'absolute' | 'relative' | 'percentage' | 'exact' | 'always_pass';

interface TolerancePolicy {
  id: string;
  tenantId?: string;
  entityType?: string;
  field?: string;
  country?: string;
  currency?: string;
  strategy: ToleranceStrategy;
  value: number;
  unit?: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type AuthorityMode =
  | 'observe_only' | 'recommend_only' | 'approval_required'
  | 'auto_accept' | 'prefer_a' | 'prefer_b' | 'latest_wins' | 'highest_value';

interface AuthorityRule {
  id: string;
  tenantId?: string;
  entityType?: string;
  field?: string;
  connectorPair?: [string, string];
  mode: AuthorityMode;
  authorityConnector?: string;
  priority: number;
  approvedBy?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type Tab = 'tolerance' | 'authority';

// ─── Blank forms ──────────────────────────────────────────────────────────────

const BLANK_TOL: Omit<TolerancePolicy, 'id' | 'createdAt' | 'updatedAt'> = {
  entityType: '', field: '', country: '', currency: '',
  strategy: 'relative', value: 0.05, unit: '%', priority: 10, enabled: true,
};

const BLANK_AUTH: Omit<AuthorityRule, 'id' | 'createdAt' | 'updatedAt'> = {
  entityType: '', field: '', mode: 'observe_only',
  authorityConnector: '', priority: 10, enabled: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scopeLabel(p: { tenantId?: string }): string {
  return p.tenantId ? p.tenantId : 'plataforma';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConsistencyRules() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('tolerance');

  // — Tolerance state —
  const [policies, setPolicies] = useState<TolerancePolicy[]>([]);
  const [tolLoading, setTolLoading] = useState(true);
  const [tolError, setTolError] = useState<string | null>(null);
  const [tolForm, setTolForm] = useState(BLANK_TOL);
  const [tolSaving, setTolSaving] = useState(false);
  const [tolShowForm, setTolShowForm] = useState(false);

  // — Authority state —
  const [rules, setRules] = useState<AuthorityRule[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ ...BLANK_AUTH, connectorA: '', connectorB: '' });
  const [authSaving, setAuthSaving] = useState(false);
  const [authShowForm, setAuthShowForm] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const loadPolicies = useCallback(async () => {
    setTolLoading(true); setTolError(null);
    try {
      const res = await fetchAdminJson<{ success: boolean; data: TolerancePolicy[] }>(
        '/api/admin/consistency/tolerance-policies',
      );
      if (res.success) setPolicies(res.data);
    } catch (e) {
      setTolError(e instanceof Error ? e.message : 'Error');
    } finally { setTolLoading(false); }
  }, []);

  const loadRules = useCallback(async () => {
    setAuthLoading(true); setAuthError(null);
    try {
      const res = await fetchAdminJson<{ success: boolean; data: AuthorityRule[] }>(
        '/api/admin/consistency/authority-rules',
      );
      if (res.success) setRules(res.data);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Error');
    } finally { setAuthLoading(false); }
  }, []);

  useEffect(() => { void loadPolicies(); }, [loadPolicies]);
  useEffect(() => { void loadRules(); }, [loadRules]);

  // ── Tolerance actions ──────────────────────────────────────────────────────

  const saveTolerance = async () => {
    setTolSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...tolForm,
        entityType: tolForm.entityType || undefined,
        field:      tolForm.field      || undefined,
        country:    tolForm.country    || undefined,
        currency:   tolForm.currency   || undefined,
        unit:       tolForm.unit       || undefined,
      };
      await fetchAdminJson('/api/admin/consistency/tolerance-policies', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setTolForm(BLANK_TOL);
      setTolShowForm(false);
      void loadPolicies();
    } catch (e) {
      setTolError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setTolSaving(false); }
  };

  const deleteTolerance = async (id: string) => {
    await fetchAdminJson(`/api/admin/consistency/tolerance-policies/${id}`, { method: 'DELETE' });
    setPolicies(prev => prev.filter(p => p.id !== id));
  };

  // ── Authority actions ──────────────────────────────────────────────────────

  const saveAuthority = async () => {
    setAuthSaving(true);
    try {
      const { connectorA, connectorB, ...rest } = authForm;
      const body: Record<string, unknown> = {
        ...rest,
        entityType:          rest.entityType          || undefined,
        field:               rest.field               || undefined,
        authorityConnector:  rest.authorityConnector  || undefined,
        connectorPair:       connectorA && connectorB ? [connectorA, connectorB] : undefined,
      };
      await fetchAdminJson('/api/admin/consistency/authority-rules', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAuthForm({ ...BLANK_AUTH, connectorA: '', connectorB: '' });
      setAuthShowForm(false);
      void loadRules();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setAuthSaving(false); }
  };

  const deleteAuthority = async (id: string) => {
    await fetchAdminJson(`/api/admin/consistency/authority-rules/${id}`, { method: 'DELETE' });
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{t('consistencyRules.title', 'Reglas de consistencia')}</h1>
        <p className="page-subtitle">
          {t('consistencyRules.subtitle', 'Tolerancias y autoridades que rigen cómo se resuelven divergencias entre conectores.')}
        </p>
      </div>

      {/* Tabs */}
      <div className="cr-tabs">
        <button
          className={`cr-tab ${tab === 'tolerance' ? 'cr-tab--active' : ''}`}
          onClick={() => setTab('tolerance')}
        >
          Tolerancias
          <span className="cr-tab-count">{policies.length}</span>
        </button>
        <button
          className={`cr-tab ${tab === 'authority' ? 'cr-tab--active' : ''}`}
          onClick={() => setTab('authority')}
        >
          Autoridad
          <span className="cr-tab-count">{rules.length}</span>
        </button>
      </div>

      {/* ── Tolerance Policies ─────────────────────────────────────────── */}
      {tab === 'tolerance' && (
        <section className="cr-section">
          <div className="cr-section-header">
            <div>
              <h2 className="cr-section-title">Tolerance Policies</h2>
              <p className="cr-section-desc">
                Definen el margen aceptable de diferencia para cada campo/entidad antes de considerar una divergencia como conflicto.
                <code className="cr-badge">tenant_id = NULL</code> = aplica a toda la plataforma.
              </p>
            </div>
            <button className="cr-btn-primary" onClick={() => setTolShowForm(f => !f)}>
              {tolShowForm ? 'Cancelar' : '+ Nueva regla'}
            </button>
          </div>

          {tolShowForm && (
            <div className="cr-form">
              <div className="cr-form-grid">
                <label className="cr-label">
                  Entidad
                  <input className="cr-input" placeholder="payment, invoice, stock…" value={tolForm.entityType}
                    onChange={e => setTolForm(p => ({ ...p, entityType: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Campo
                  <input className="cr-input" placeholder="transaction_amount, quantity…" value={tolForm.field}
                    onChange={e => setTolForm(p => ({ ...p, field: e.target.value }))} />
                </label>
                <label className="cr-label">
                  País (ISO 3166)
                  <input className="cr-input" placeholder="AR, BR…" value={tolForm.country}
                    onChange={e => setTolForm(p => ({ ...p, country: e.target.value.toUpperCase() }))} />
                </label>
                <label className="cr-label">
                  Moneda (ISO 4217)
                  <input className="cr-input" placeholder="ARS, USD…" value={tolForm.currency}
                    onChange={e => setTolForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} />
                </label>
                <label className="cr-label">
                  Estrategia
                  <select className="cr-input" value={tolForm.strategy}
                    onChange={e => setTolForm(p => ({ ...p, strategy: e.target.value as ToleranceStrategy }))}>
                    <option value="relative">relative — % del valor</option>
                    <option value="absolute">absolute — diferencia fija</option>
                    <option value="percentage">percentage — valor en 0..100</option>
                    <option value="exact">exact — igualdad estricta</option>
                    <option value="always_pass">always_pass — nunca conflicto</option>
                  </select>
                </label>
                <label className="cr-label">
                  Valor
                  <input className="cr-input" type="number" step="0.01" value={tolForm.value}
                    onChange={e => setTolForm(p => ({ ...p, value: Number(e.target.value) }))} />
                </label>
                <label className="cr-label">
                  Unidad (informativo)
                  <input className="cr-input" placeholder="%, ARS, units…" value={tolForm.unit}
                    onChange={e => setTolForm(p => ({ ...p, unit: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Prioridad
                  <input className="cr-input" type="number" value={tolForm.priority}
                    onChange={e => setTolForm(p => ({ ...p, priority: Number(e.target.value) }))} />
                </label>
              </div>
              <div className="cr-form-footer">
                <label className="cr-checkbox">
                  <input type="checkbox" checked={tolForm.enabled}
                    onChange={e => setTolForm(p => ({ ...p, enabled: e.target.checked }))} />
                  Habilitada
                </label>
                <button className="cr-btn-primary" onClick={() => void saveTolerance()} disabled={tolSaving}>
                  {tolSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {tolError && <div className="page-error">{tolError}</div>}
          {tolLoading ? (
            <div className="page-loading">Cargando tolerancias…</div>
          ) : policies.length === 0 ? (
            <p className="cr-empty">Sin reglas. Los seeds de plataforma se cargan en la migración 021.</p>
          ) : (
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Scope</th><th>Entidad</th><th>Campo</th>
                  <th>País</th><th>Moneda</th><th>Estrategia</th>
                  <th>Valor</th><th>Prio</th><th>Estado</th><th>Creada</th><th></th>
                </tr>
              </thead>
              <tbody>
                {policies.sort((a, b) => b.priority - a.priority).map(p => (
                  <tr key={p.id} className="cr-row">
                    <td><span className="cr-scope">{scopeLabel(p)}</span></td>
                    <td>{p.entityType ?? <span className="cr-any">cualquier</span>}</td>
                    <td className="cr-mono">{p.field ?? <span className="cr-any">cualquier</span>}</td>
                    <td>{p.country ?? '—'}</td>
                    <td>{p.currency ?? '—'}</td>
                    <td><span className="cr-strategy">{p.strategy}</span></td>
                    <td className="cr-mono">{p.value}{p.unit ? ` ${p.unit}` : ''}</td>
                    <td>{p.priority}</td>
                    <td>
                      <span className={`cr-status ${p.enabled ? 'cr-status--on' : 'cr-status--off'}`}>
                        {p.enabled ? 'activa' : 'inactiva'}
                      </span>
                    </td>
                    <td className="cr-date">{fmtDate(p.createdAt)}</td>
                    <td>
                      <button className="cr-btn-danger" onClick={() => void deleteTolerance(p.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ── Authority Rules ────────────────────────────────────────────── */}
      {tab === 'authority' && (
        <section className="cr-section">
          <div className="cr-section-header">
            <div>
              <h2 className="cr-section-title">Authority Rules</h2>
              <p className="cr-section-desc">
                Definen qué conector gana cuando dos fuentes divergen. El motor evalúa la primera regla que matchea por prioridad.
              </p>
            </div>
            <button className="cr-btn-primary" onClick={() => setAuthShowForm(f => !f)}>
              {authShowForm ? 'Cancelar' : '+ Nueva regla'}
            </button>
          </div>

          {authShowForm && (
            <div className="cr-form">
              <div className="cr-form-grid">
                <label className="cr-label">
                  Entidad
                  <input className="cr-input" placeholder="payment, invoice…" value={authForm.entityType}
                    onChange={e => setAuthForm(p => ({ ...p, entityType: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Campo
                  <input className="cr-input" placeholder="status, amount…" value={authForm.field}
                    onChange={e => setAuthForm(p => ({ ...p, field: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Conector A (par, opcional)
                  <input className="cr-input" placeholder="mercadopago" value={authForm.connectorA}
                    onChange={e => setAuthForm(p => ({ ...p, connectorA: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Conector B (par, opcional)
                  <input className="cr-input" placeholder="contabilium" value={authForm.connectorB}
                    onChange={e => setAuthForm(p => ({ ...p, connectorB: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Modo
                  <select className="cr-input" value={authForm.mode}
                    onChange={e => setAuthForm(p => ({ ...p, mode: e.target.value as AuthorityMode }))}>
                    <option value="observe_only">observe_only — solo registrar</option>
                    <option value="recommend_only">recommend_only — sugerir al operador</option>
                    <option value="approval_required">approval_required — requiere aprobación</option>
                    <option value="auto_accept">auto_accept — aceptar automáticamente</option>
                    <option value="prefer_a">prefer_a — conector A gana</option>
                    <option value="prefer_b">prefer_b — conector B gana</option>
                    <option value="latest_wins">latest_wins — más reciente gana</option>
                    <option value="highest_value">highest_value — valor mayor gana</option>
                  </select>
                </label>
                <label className="cr-label">
                  Conector de autoridad
                  <input className="cr-input" placeholder="requerido para prefer_a/b" value={authForm.authorityConnector}
                    onChange={e => setAuthForm(p => ({ ...p, authorityConnector: e.target.value }))} />
                </label>
                <label className="cr-label">
                  Prioridad
                  <input className="cr-input" type="number" value={authForm.priority}
                    onChange={e => setAuthForm(p => ({ ...p, priority: Number(e.target.value) }))} />
                </label>
              </div>
              <div className="cr-form-footer">
                <label className="cr-checkbox">
                  <input type="checkbox" checked={authForm.enabled}
                    onChange={e => setAuthForm(p => ({ ...p, enabled: e.target.checked }))} />
                  Habilitada
                </label>
                <button className="cr-btn-primary" onClick={() => void saveAuthority()} disabled={authSaving}>
                  {authSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {authError && <div className="page-error">{authError}</div>}
          {authLoading ? (
            <div className="page-loading">Cargando reglas de autoridad…</div>
          ) : rules.length === 0 ? (
            <p className="cr-empty">Sin reglas definidas. Por defecto se usa <code>observe_only</code>.</p>
          ) : (
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Scope</th><th>Entidad</th><th>Campo</th>
                  <th>Par de conectores</th><th>Modo</th>
                  <th>Autoridad</th><th>Prio</th><th>Estado</th><th>Creada</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rules.sort((a, b) => b.priority - a.priority).map(r => (
                  <tr key={r.id} className="cr-row">
                    <td><span className="cr-scope">{scopeLabel(r)}</span></td>
                    <td>{r.entityType ?? <span className="cr-any">cualquier</span>}</td>
                    <td className="cr-mono">{r.field ?? <span className="cr-any">cualquier</span>}</td>
                    <td className="cr-mono cr-small">{r.connectorPair ? `${r.connectorPair[0]} ↔ ${r.connectorPair[1]}` : '—'}</td>
                    <td><span className={`cr-mode cr-mode--${r.mode.replace('_', '-')}`}>{r.mode}</span></td>
                    <td className="cr-mono">{r.authorityConnector ?? '—'}</td>
                    <td>{r.priority}</td>
                    <td>
                      <span className={`cr-status ${r.enabled ? 'cr-status--on' : 'cr-status--off'}`}>
                        {r.enabled ? 'activa' : 'inactiva'}
                      </span>
                    </td>
                    <td className="cr-date">{fmtDate(r.createdAt)}</td>
                    <td>
                      <button className="cr-btn-danger" onClick={() => void deleteAuthority(r.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

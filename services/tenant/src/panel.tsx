// Panel mínimo de operación multi-tenant (React base)
import React, { useState } from 'react';

export function TenantPanel() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // TODO: fetch tenants from API

  return (
    <div style={{ padding: 24 }}>
      <h2>Tenants</h2>
      <ul>
        {tenants.map((t: any) => (
          <li key={t.id}>
            <button onClick={() => setSelectedTenant(t)}>{t.name}</button>
          </li>
        ))}
      </ul>
      {selectedTenant && (
        <div style={{ marginTop: 24 }}>
          <h3>{selectedTenant.name}</h3>
          <p>Status: {selectedTenant.status}</p>
          <p>Plan: {selectedTenant.plan}</p>
          <button>Suspender</button>
          <button>Reanudar</button>
          {/* TODO: workflows, runs, DLQ, métricas, credenciales */}
        </div>
      )}
    </div>
  );
}

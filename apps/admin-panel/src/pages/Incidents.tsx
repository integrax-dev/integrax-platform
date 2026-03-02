/**
 * Incidents Page — API Drift Monitoring
 *
 * Read-only view of API drift incidents detected by connector-watchdog.
 * Fetches from the watchdog metrics endpoint and displays drift reports.
 * Admins can view evidence packs and dismiss/resolve incidents.
 */

import { useState, useEffect } from 'react';
import './Pages.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type DriftSeverity = 'critical' | 'major' | 'minor' | 'none';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

interface DriftChange {
  type: string;
  severity: DriftSeverity;
  path?: string;
  description: string;
}

interface DriftIncident {
  id: string;
  connectorId: string;
  detectedAt: string;
  severity: DriftSeverity;
  status: IncidentStatus;
  changes: DriftChange[];
  prUrl?: string;
  evidencePackPath?: string;
  baselineVersion: string;
  currentVersion: string;
}

// ─── Mock data (replaced by real API when watchdog exposes HTTP endpoint) ─────

const MOCK_INCIDENTS: DriftIncident[] = [
  {
    id: 'drift-001',
    connectorId: 'mercadopago',
    detectedAt: new Date(Date.now() - 3600000).toISOString(),
    severity: 'critical',
    status: 'open',
    changes: [
      { type: 'endpoint_removed', severity: 'critical', path: 'GET:/v1/payments', description: 'Endpoint GET /v1/payments was removed' },
      { type: 'auth_changed', severity: 'critical', description: 'Global authentication scheme changed from apiKey to OAuth2' },
    ],
    prUrl: 'https://github.com/integrax/integrax-platform/pull/42',
    baselineVersion: '1.5.0',
    currentVersion: '2.0.0',
  },
  {
    id: 'drift-002',
    connectorId: 'mercadolibre',
    detectedAt: new Date(Date.now() - 7200000).toISOString(),
    severity: 'major',
    status: 'investigating',
    changes: [
      { type: 'response_schema_changed', severity: 'major', path: 'GET:/orders', description: 'Response schema for GET /orders changed — field "shipping" restructured' },
      { type: 'param_changed', severity: 'major', path: 'POST:/items', description: 'Request body for POST /items requires new field "condition"' },
    ],
    baselineVersion: '3.1.0',
    currentVersion: '3.2.0',
  },
  {
    id: 'drift-003',
    connectorId: 'afip-wsfe',
    detectedAt: new Date(Date.now() - 86400000).toISOString(),
    severity: 'minor',
    status: 'resolved',
    changes: [
      { type: 'endpoint_added', severity: 'minor', path: 'GET:/v2/health', description: 'New endpoint added: GET /v2/health' },
    ],
    baselineVersion: '1.0.0',
    currentVersion: '1.1.0',
  },
  {
    id: 'drift-004',
    connectorId: 'shopify',
    detectedAt: new Date(Date.now() - 172800000).toISOString(),
    severity: 'major',
    status: 'dismissed',
    changes: [
      { type: 'version_changed', severity: 'minor', description: 'API version changed: 2024-01 → 2024-04' },
      { type: 'response_schema_changed', severity: 'major', path: 'GET:/products.json', description: 'Product status enum expanded to include new values' },
    ],
    baselineVersion: '2024-01',
    currentVersion: '2024-04',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'major': return '#d97706';
    case 'minor': return '#2563eb';
    default: return '#6b7280';
  }
}

function statusColor(status: IncidentStatus): string {
  switch (status) {
    case 'open': return '#dc2626';
    case 'investigating': return '#d97706';
    case 'resolved': return '#16a34a';
    case 'dismissed': return '#6b7280';
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Incidents() {
  const [incidents, setIncidents] = useState<DriftIncident[]>(MOCK_INCIDENTS);
  const [selected, setSelected] = useState<DriftIncident | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<DriftSeverity | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | 'all'>('all');

  const filtered = incidents.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    return true;
  });

  const summary = {
    critical: incidents.filter(i => i.severity === 'critical' && i.status === 'open').length,
    major: incidents.filter(i => i.severity === 'major' && i.status === 'open').length,
    total: incidents.filter(i => i.status === 'open').length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>API Drift Incidents</h1>
        <p className="page-subtitle">Monitor API contract violations detected by connector-watchdog</p>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="stat-value" style={{ color: '#dc2626' }}>{summary.critical}</div>
          <div className="stat-label">Critical Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #d97706' }}>
          <div className="stat-value" style={{ color: '#d97706' }}>{summary.major}</div>
          <div className="stat-label">Major Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #6b7280' }}>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-label">Total Open</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <div className="stat-value" style={{ color: '#16a34a' }}>
            {incidents.filter(i => i.status === 'resolved').length}
          </div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            SEVERITY
          </label>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value as typeof filterSeverity)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            STATUS
          </label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      {/* Incident list */}
      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            No incidents match the current filters.
          </div>
        )}

        {filtered.map(incident => (
          <div
            key={incident.id}
            onClick={() => setSelected(incident.id === selected?.id ? null : incident)}
            style={{
              background: '#fff',
              borderRadius: 8,
              border: `1px solid ${incident.id === selected?.id ? severityColor(incident.severity) : '#e2e8f0'}`,
              borderLeft: `4px solid ${severityColor(incident.severity)}`,
              padding: 16,
              cursor: 'pointer',
              transition: 'box-shadow 0.15s',
              boxShadow: incident.id === selected?.id ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: severityColor(incident.severity) + '20',
                color: severityColor(incident.severity),
                textTransform: 'uppercase',
              }}>
                {incident.severity}
              </span>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                {incident.connectorId}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: statusColor(incident.status) + '15',
                color: statusColor(incident.status),
              }}>
                {incident.status}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                {timeAgo(incident.detectedAt)}
              </span>
            </div>

            {/* Changes summary */}
            <div style={{ fontSize: 13, color: '#475569' }}>
              {incident.changes.length} change{incident.changes.length !== 1 ? 's' : ''} detected
              {incident.changes.length > 0 && ': ' + incident.changes[0].description}
              {incident.changes.length > 1 && ` (+${incident.changes.length - 1} more)`}
            </div>

            {/* Version + PR badge */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                v{incident.baselineVersion} → v{incident.currentVersion}
              </span>
              {incident.prUrl && (
                <a
                  href={incident.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    background: '#f1f5f9', color: '#6366f1', textDecoration: 'none',
                    border: '1px solid #e2e8f0', fontWeight: 600,
                  }}
                >
                  PR #{incident.prUrl.split('/').pop()}
                </a>
              )}
            </div>

            {/* Expanded detail */}
            {incident.id === selected?.id && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>
                  All Changes
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {incident.changes.map((change, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: 8, background: '#f8fafc', borderRadius: 6,
                        border: `1px solid ${severityColor(change.severity)}30`,
                      }}
                    >
                      <span style={{
                        flexShrink: 0, padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                        background: severityColor(change.severity) + '20',
                        color: severityColor(change.severity),
                        textTransform: 'uppercase',
                      }}>
                        {change.severity}
                      </span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>
                          {change.type}
                          {change.path && <span style={{ color: '#6366f1', marginLeft: 6 }}>{change.path}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{change.description}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {incident.status === 'open' && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setIncidents(prev => prev.map(i =>
                          i.id === incident.id ? { ...i, status: 'investigating' } : i
                        ));
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid #d97706',
                        background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Mark as Investigating
                    </button>
                  )}
                  {(incident.status === 'open' || incident.status === 'investigating') && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setIncidents(prev => prev.map(i =>
                          i.id === incident.id ? { ...i, status: 'resolved' } : i
                        ));
                        setSelected(null);
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid #16a34a',
                        background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Resolve
                    </button>
                  )}
                  {incident.status === 'open' && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setIncidents(prev => prev.map(i =>
                          i.id === incident.id ? { ...i, status: 'dismissed' } : i
                        ));
                        setSelected(null);
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                        background: '#f8fafc', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';

type DriftSeverity = 'critical' | 'major' | 'minor';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
type DriftProtocol = 'sql' | 'openapi' | 'avro' | 'csv' | 'jsonl' | 'xml' | 'soap' | 'graphql' | 'parquet' | 'protobuf';

type FieldDiff = {
  kind: string;
  pathA: string | null;
  pathB: string | null;
  nodeA?: { type?: string; required?: boolean } | null;
  nodeB?: { type?: string; required?: boolean } | null;
  breakingScore: number;
};

type FieldMapping = {
  id: string;
  pathA: string | null;
  pathB: string | null;
  confidence: number;
  decisionReason?: string;
  transform?: { kind?: string; description?: string };
};

type ResolvedConflict = {
  diff: FieldDiff;
  mapping: FieldMapping | null;
  confidence: number;
  resolution: string;
  llmRequired: boolean;
  llmReason?: string;
};

type RequirementsReport = {
  summary: {
    totalDiffs: number;
    breakingCount: number;
    nonBreakingCount: number;
    informationalCount?: number;
    llmEscalationCount: number;
    resolvedDeterministically: number;
    resolvedByHeuristic?: number;
    coveragePercent?: number;
  };
  llmEscalations: Array<{ diff: FieldDiff; reason: string; promptSeed: string }>;
};

type BridgeReport = {
  id: string;
  tenantId?: string;
  connectorAId: string;
  connectorBId: string;
  diffs: FieldDiff[];
  mappings: FieldMapping[];
  resolvedConflicts: ResolvedConflict[];
  requirementsReport: RequirementsReport;
  generatedTransformTs?: string;
  generatedAt: string;
};

type DriftIncident = {
  id: string;
  sourceId: string;
  protocol: DriftProtocol;
  severity: DriftSeverity;
  status: IncidentStatus;
  bridgeReport: BridgeReport | null;
  impactScore: number | null;
  routingTarget: string | null;
  remediationHints: Array<{ key: string; params: Record<string, string> }>;
  affectedTenants: string[];
  llmAnalysis: Array<{
    escalationIndex: number;
    action: string;
    suggestion: string;
    confidence: number;
    reasoning: string;
    analyzedAt: string;
  }>;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function titleCase(value: string): string {
  return value.replace(/[_:-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function severityClass(severity: string) {
  if (severity === 'critical' || severity === 'Critical') return 'badge badge-error';
  if (severity === 'major' || severity === 'High') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function statusClass(status: string) {
  if (status === 'resolved') return 'badge badge-success';
  if (status === 'investigating') return 'badge badge-warning';
  if (status === 'open') return 'badge badge-error';
  return 'badge badge-neutral';
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function nodeType(node?: FieldDiff['nodeA']): string {
  if (!node) return 'missing';
  const required = node.required === false ? '|optional' : '';
  return `${node.type ?? 'unknown'}${required}`;
}

function diffImpact(diff: FieldDiff): 'breaking' | 'safe' {
  return diff.breakingScore >= 0.5 ? 'breaking' : 'safe';
}

function diffPath(diff: FieldDiff): string {
  return diff.pathA ?? diff.pathB ?? 'unknown.path';
}

function makeTimeline(incident: DriftIncident) {
  const items = [
    { time: incident.detectedAt, label: 'Incident detected', detail: `${titleCase(incident.protocol)} drift detected on ${incident.sourceId}` },
  ];

  if (incident.bridgeReport) {
    const summary = incident.bridgeReport.requirementsReport.summary;
    items.push({
      time: incident.bridgeReport.generatedAt,
      label: 'Bridge report generated',
      detail: `${summary.totalDiffs} diffs · ${summary.breakingCount} breaking · ${summary.llmEscalationCount} LLM escalations`,
    });
  }

  if (incident.affectedTenants.length > 0) {
    items.push({
      time: incident.updatedAt ?? incident.detectedAt,
      label: 'Blast radius calculated',
      detail: `${incident.affectedTenants.length} tenant(s) affected`,
    });
  }

  if (incident.llmAnalysis.length > 0) {
    const latest = incident.llmAnalysis[incident.llmAnalysis.length - 1];
    items.push({
      time: latest.analyzedAt,
      label: 'LLM analysis completed',
      detail: `${titleCase(latest.action)} · confidence ${Math.round(latest.confidence * 100)}%`,
    });
  }

  if (incident.resolvedAt) {
    items.push({ time: incident.resolvedAt, label: 'Incident resolved', detail: 'Operator marked incident as resolved' });
  }

  return items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function IncidentDetail() {
  const { t } = useTranslation();
  const { incidentId = '' } = useParams();
  const [incident, setIncident] = useState<DriftIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [remediating, setRemediating] = useState(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminJson<{ success: boolean; data: DriftIncident }>(`/api/drift/incidents/${incidentId}`);
      setIncident(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incident');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (status: IncidentStatus) => {
    if (!incident) return;
    setUpdating(true);
    try {
      await fetchAdminJson(`/api/drift/incidents/${incident.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setIncident(prev => prev ? { ...prev, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : prev.resolvedAt } : prev);
    } finally {
      setUpdating(false);
    }
  };

  const startRemediation = async () => {
    if (!incident) return;
    setRemediating(true);
    try {
      await fetchAdminJson(`/api/drift/incidents/${incident.id}/remediate`, { method: 'POST' });
      await load();
    } finally {
      setRemediating(false);
    }
  };

  const report = incident?.bridgeReport ?? null;
  const conflicts = report?.resolvedConflicts ?? [];
  const diffs = useMemo(() => report?.diffs ?? conflicts.map(conflict => conflict.diff), [report?.diffs, conflicts]);
  const mappings = useMemo(
    () => report?.mappings?.length ? report.mappings : conflicts.flatMap(conflict => conflict.mapping ? [conflict.mapping] : []),
    [report?.mappings, conflicts],
  );
  const summary = report?.requirementsReport.summary;
  const breakingCount = summary?.breakingCount ?? diffs.filter(diff => diffImpact(diff) === 'breaking').length;
  const timeline = incident ? makeTimeline(incident) : [];

  if (loading) {
    return <div className="page"><section className="card">Cargando incidente real…</section></div>;
  }

  if (error || !incident) {
    return (
      <div className="page">
        <section className="card empty-detail">
          <h2>No pude cargar este incidente</h2>
          <p>{error ?? 'Incident not found'}</p>
          <div className="side-actions">
            <button className="btn btn-secondary" onClick={() => void load()}>Retry</button>
            <Link to="/incidents" className="btn btn-primary">Volver a incidentes</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="admin-hero detail-hero">
        <div>
          <div className="chip-row hero-badges">
            <span className={severityClass(incident.severity)}>{incident.severity.toUpperCase()}</span>
            <span className={statusClass(incident.status)}>{incident.status.toUpperCase()}</span>
            <span className="badge badge-neutral">{incident.protocol.toUpperCase()}</span>
            <span className="badge badge-neutral">{incident.id}</span>
          </div>
          <h1>{titleCase(incident.sourceId)} schema drift incident</h1>
          <p>
            Real incident loaded from control-plane. Source <strong>{incident.sourceId}</strong>
            {report ? <> compares <strong>{report.connectorAId}</strong> → <strong>{report.connectorBId}</strong></> : null}
            {' '}with {diffs.length} detected schema diff(s).
          </p>
        </div>
        <div className="hero-actions">
          <Link to="/incidents" className="btn btn-secondary">Back</Link>
          {incident.status === 'open' && (
            <button disabled={updating} onClick={() => void updateStatus('investigating')} className="btn btn-secondary">
              Mark investigating
            </button>
          )}
          {(incident.status === 'open' || incident.status === 'investigating') && (
            <button disabled={updating} onClick={() => void updateStatus('resolved')} className="btn btn-secondary">
              Resolve
            </button>
          )}
          <button
            disabled={remediating || incident.affectedTenants.length === 0}
            onClick={() => void startRemediation()}
            className="btn btn-primary"
          >
            {remediating ? 'Starting…' : 'Start remediation'}
          </button>
        </div>
      </section>

      <div className="detail-layout">
        <main className="detail-main">
          <section className="card">
            <h2>Impact summary</h2>
            <div className="mini-grid four">
              <div className="inset-card"><span>Affected tenants</span><strong>{incident.affectedTenants.length}</strong></div>
              <div className="inset-card"><span>Breaking fields</span><strong>{breakingCount}</strong></div>
              <div className="inset-card"><span>Total diffs</span><strong>{summary?.totalDiffs ?? diffs.length}</strong></div>
              <div className="inset-card"><span>Impact score</span><strong>{incident.impactScore === null ? '—' : Math.round(incident.impactScore * 100)}</strong></div>
            </div>
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>Schema diff</h2>
              <div className="chip-row">
                <span className="badge badge-error">{breakingCount} breaking</span>
                <span className="badge badge-success">{Math.max(0, diffs.length - breakingCount)} safe</span>
              </div>
            </div>
            {diffs.length === 0 ? (
              <div className="empty-dashed">Este incidente no tiene diffs disponibles en el BridgeReport.</div>
            ) : (
              <div className="table-shell">
                <table className="table">
                  <thead>
                    <tr><th>Path</th><th>Before</th><th>After</th><th>Kind</th><th>Impact</th></tr>
                  </thead>
                  <tbody>
                    {diffs.map((diff, index) => (
                      <tr key={`${diff.kind}-${diff.pathA}-${diff.pathB}-${index}`}>
                        <td><code>{diffPath(diff)}</code></td>
                        <td>{nodeType(diff.nodeA)}</td>
                        <td>{nodeType(diff.nodeB)}</td>
                        <td>{titleCase(diff.kind)}</td>
                        <td>
                          <span className={`badge ${diffImpact(diff) === 'breaking' ? 'badge-error' : 'badge-success'}`}>
                            {diffImpact(diff)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Suggested mapping adjustments</h2>
            {mappings.length === 0 ? (
              <div className="empty-dashed">No hay mappings sugeridos para este incidente.</div>
            ) : (
              <div className="stack-list">
                {mappings.map((mapping, index) => (
                  <div key={mapping.id ?? `${mapping.pathA}-${mapping.pathB}-${index}`} className="mapping-row">
                    <div>
                      <code>{mapping.pathA ?? '∅'} → {mapping.pathB ?? '∅'}</code>
                      <p>{mapping.transform?.description ?? mapping.decisionReason ?? mapping.transform?.kind ?? 'Mapping candidate'}</p>
                    </div>
                    <div className="mapping-actions">
                      <span className="badge badge-neutral">confidence {mapping.confidence.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Affected tenants</h2>
            {incident.affectedTenants.length === 0 ? (
              <div className="empty-dashed">No hay tenants afectados registrados.</div>
            ) : (
              <div className="table-shell">
                <table className="table">
                  <thead>
                    <tr><th>Tenant</th><th>Severity</th><th>Status</th><th>Source</th><th></th></tr>
                  </thead>
                  <tbody>
                    {incident.affectedTenants.map(tenant => (
                      <tr key={tenant}>
                        <td><strong>{tenant}</strong></td>
                        <td><span className={severityClass(incident.severity)}>{incident.severity}</span></td>
                        <td><span className={statusClass(incident.status)}>{incident.status}</span></td>
                        <td>{incident.sourceId}</td>
                        <td className="align-right"><button className="link-button">Open tenant</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside className="detail-side">
          <section className="card">
            <h2>Incident status</h2>
            <div className="kv-list">
              <div><span>Source</span><strong>{incident.sourceId}</strong></div>
              <div><span>Protocol</span><strong>{incident.protocol.toUpperCase()}</strong></div>
              <div><span>Connector A</span><strong>{report?.connectorAId ?? '—'}</strong></div>
              <div><span>Connector B</span><strong>{report?.connectorBId ?? '—'}</strong></div>
              <div><span>Routing target</span><strong>{incident.routingTarget ?? '—'}</strong></div>
              <div><span>Detected at</span><strong>{formatTime(incident.detectedAt)}</strong></div>
            </div>
          </section>

          <section className="card">
            <h2>LLM analysis</h2>
            {incident.llmAnalysis.length === 0 ? (
              <div className="analysis-box">
                No hay análisis LLM persistido para este incidente. Escalaciones pendientes:{' '}
                <strong>{report?.requirementsReport.summary.llmEscalationCount ?? 0}</strong>.
              </div>
            ) : (
              <div className="stack-list">
                {incident.llmAnalysis.map(item => (
                  <div key={`${item.escalationIndex}-${item.analyzedAt}`} className="analysis-box">
                    <strong>{titleCase(item.action)} · confidence {item.confidence.toFixed(2)}</strong>
                    <p>{item.suggestion}</p>
                    <p>{item.reasoning}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Remediation hints</h2>
            {incident.remediationHints.length === 0 ? (
              <div className="empty-dashed">No hay hints de remediación registrados.</div>
            ) : (
              <ul className="hint-list">
                {incident.remediationHints.map((hint, index) => (
                  <li key={`${hint.key}-${index}`}>{t(hint.key, hint.params as Record<string, unknown>)}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Incident timeline</h2>
            <div className="timeline-list">
              {timeline.map(item => (
                <div key={item.time + item.label}>
                  <span className="timeline-dot" />
                  <div>
                    <time>{formatTime(item.time)}</time>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

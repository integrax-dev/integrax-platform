/**
 * Incidents Page — Schema Drift Monitoring
 *
 * Consumes the full BridgeReport from /api/drift/incidents to surface:
 *   - Protocol badge (SQL / OpenAPI / Avro / CSV / SOAP / GraphQL)
 *   - Blast radius (affected tenants count)
 *   - Fingerprint delta (schemaA → schemaB)
 *   - Resolution summary (auto-resolved vs LLM escalations vs breaking)
 *   - Per-diff table: kind · path · confidence · llmRequired
 *   - Collapsible promptSeeds for LLM escalations
 *   - Start Remediation CTA for critical incidents with affected tenants
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';

// ─── Types (mirrors BridgeReport + DriftIncident from the store) ──────────────

type DriftSeverity  = 'critical' | 'major' | 'minor';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
type RoutingTarget  = 'operator_review' | 'incident_alert' | 'timeline_trace' | 'auto_resolved';
type DriftProtocol  = 'sql' | 'openapi' | 'avro' | 'csv' | 'jsonl' | 'xml' | 'soap' | 'graphql' | 'parquet' | 'protobuf';
type DiffKind       = 'field_removed' | 'field_added' | 'type_changed' | 'rename_candidate' | string;
type ConflictClass  = 'auto_resolved' | 'human_review' | 'ambiguous' | string;

interface ResolvedConflict {
  diff: {
    kind: DiffKind;
    pathA: string | null;
    pathB: string | null;
    breakingScore: number;
  };
  resolution: ConflictClass;
  confidence: number;
  llmRequired: boolean;
  llmReason?: string;
}

interface LLMEscalation {
  diff: { kind: DiffKind; pathA: string | null; pathB: string | null };
  reason: string;
  promptSeed: string;
}

interface RequirementsReport {
  llmEscalations: LLMEscalation[];
  summary: {
    totalDiffs: number;
    breakingCount: number;
    nonBreakingCount: number;
    llmEscalationCount: number;
    resolvedDeterministically: number;
  };
}

interface BridgeReport {
  resolvedConflicts: ResolvedConflict[];
  requirementsReport: RequirementsReport;
  inferredSchemaA?: { fingerprint?: string };
  inferredSchemaB?: { fingerprint?: string };
  generatedTransformTs?: string;
}

interface LLMAnalysisResult {
  escalationIndex: number;
  action: AIAnalysis['action'];
  suggestion: string;
  confidence: number;
  reasoning: string;
  analyzedAt: string;
}

interface DriftIncident {
  id: string;
  sourceId: string;
  protocol: DriftProtocol;
  severity: DriftSeverity;
  status: IncidentStatus;
  bridgeReport: BridgeReport | null;
  impactScore: number | null;
  routingTarget: RoutingTarget | null;
  remediationHints: string[];
  affectedTenants: string[];
  /** Pre-computed LLM analysis — auto-populated for critical incidents on ingest,
   *  on-demand for others. Empty array means not yet analyzed. */
  llmAnalysis: LLMAnalysisResult[];
  detectedAt: string;
  resolvedAt: string | null;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<DriftSeverity, string> = {
  critical: '#dc2626',
  major:    '#d97706',
  minor:    '#2563eb',
};

const STATUS_COLOR: Record<IncidentStatus, string> = {
  open:          '#dc2626',
  investigating: '#d97706',
  resolved:      '#16a34a',
  dismissed:     '#6b7280',
};

const PROTOCOL_COLOR: Record<DriftProtocol, string> = {
  sql:      '#7c3aed',
  openapi:  '#0284c7',
  avro:     '#0891b2',
  csv:      '#059669',
  jsonl:    '#0d9488',
  xml:      '#ea580c',
  soap:     '#d97706',
  graphql:  '#e11d48',
  parquet:  '#7c2d12',
  protobuf: '#1d4ed8',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortFingerprint(fp?: string): string {
  if (!fp) return '—';
  return fp.length > 10 ? fp.slice(0, 8) + '…' : fp;
}

/** Generates the one-liner summary shown in the collapsed row, e.g.
 *  "2 changes detected: field 'payments' was removed (+1 more)" */
function changeSummary(conflicts: ResolvedConflict[]): string {
  if (!conflicts.length) return 'No diffs recorded';
  const first = conflicts[0];
  const { kind, pathA, pathB } = first.diff;
  const name = pathA ?? pathB ?? '';
  const kindDescriptions: Record<string, string> = {
    field_removed:    `field '${name}' was removed`,
    field_added:      `field '${name}' was added`,
    type_changed:     `type changed on '${name}'`,
    rename_candidate: `'${pathA}' may have been renamed to '${pathB}'`,
  };
  const firstDesc = kindDescriptions[kind] ?? `${kind.replace(/_/g, ' ')} on '${name}'`;
  const rest = conflicts.length - 1;
  const suffix = rest > 0 ? ` (+${rest} more)` : '';
  return `${conflicts.length} change${conflicts.length !== 1 ? 's' : ''} detected: ${firstDesc}${suffix}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({
  label, color, bg,
}: { label: string; color: string; bg?: string }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: bg ?? (color + '18'), color, textTransform: 'uppercase' as const,
      letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' as const,
    }}>
      {label}
    </span>
  );
}

function ResolutionSummary({ report }: { report: RequirementsReport | undefined }) {
  if (!report) return null;
  const s = report.summary;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {s.resolvedDeterministically > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '3px 8px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
          ✓ {s.resolvedDeterministically} auto-resolved
        </span>
      )}
      {s.llmEscalationCount > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#faf5ff', padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd6fe' }}>
          ⚡ {s.llmEscalationCount} pending LLM
        </span>
      )}
      {s.breakingCount > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '3px 8px', borderRadius: 4, border: '1px solid #fecaca' }}>
          ✕ {s.breakingCount} breaking
        </span>
      )}
    </div>
  );
}

/** Converts a diff kind + paths into a human-readable description line */
function diffDescription(kind: string, pathA: string | null, pathB: string | null): string {
  const a = pathA ?? '?';
  const b = pathB ?? '?';
  switch (kind) {
    case 'field_removed':    return `Field "${a}" was removed`;
    case 'field_added':      return `Field "${b}" was added`;
    case 'type_changed':     return `Type changed on "${a}"${b && b !== a ? ` → "${b}"` : ''}`;
    case 'rename_candidate': return `"${a}" may have been renamed to "${b}"`;
    default:                 return `${kind.replace(/_/g, ' ')} on "${a}"`;
  }
}

/** GitHub-style diff with human-readable descriptions (like Antigraviity had) */
function DiffTable({ conflicts }: { conflicts: ResolvedConflict[] }) {
  if (!conflicts.length) return null;

  type DiffLine = {
    prefix: '+' | '-' | '~';
    path: string;
    description: string;
    bg: string; fg: string; borderLeft: string;
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Schema Diffs ({conflicts.length})
      </div>
      <div style={{
        borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden',
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      }}>
        {/* Hunk header */}
        <div style={{ background: '#f6f8fa', borderBottom: '1px solid #e2e8f0', padding: '5px 14px', fontSize: 12, color: '#57606a', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>@@ schema diff @@</span>
          <span>{conflicts.length} change{conflicts.length !== 1 ? 's' : ''}</span>
        </div>

        {conflicts.map((rc, i) => {
          const { diff } = rc;
          const lines: DiffLine[] = [];

          if (diff.kind === 'field_removed') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB), bg: '#ffeef0', fg: '#b91c1c', borderLeft: '#dc2626' });
          } else if (diff.kind === 'field_added') {
            lines.push({ prefix: '+', path: diff.pathB ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB), bg: '#e6ffed', fg: '#15803d', borderLeft: '#16a34a' });
          } else if (diff.kind === 'rename_candidate') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: `Was: "${diff.pathA}"`, bg: '#ffeef0', fg: '#b91c1c', borderLeft: '#dc2626' });
            lines.push({ prefix: '+', path: diff.pathB ?? '?', description: `Now: "${diff.pathB}" (rename candidate)`, bg: '#e6ffed', fg: '#15803d', borderLeft: '#16a34a' });
          } else if (diff.kind === 'type_changed') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: `Before: "${diff.pathA}"`, bg: '#fff8f1', fg: '#c2410c', borderLeft: '#f97316' });
            lines.push({ prefix: '+', path: diff.pathB ?? diff.pathA ?? '?', description: `After: "${diff.pathB ?? diff.pathA}" (type changed)`, bg: '#f0fdf4', fg: '#15803d', borderLeft: '#22c55e' });
          } else {
            lines.push({ prefix: '~', path: diff.pathA ?? diff.pathB ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB), bg: '#fffbeb', fg: '#92400e', borderLeft: '#d97706' });
          }

          return (
            <div key={i} style={{ borderBottom: i < conflicts.length - 1 ? '1px solid #f0f3f6' : 'none' }}>
              {lines.map((line, li) => (
                <div key={li} style={{ background: line.bg, borderLeft: `3px solid ${line.borderLeft}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
                    {/* Line number */}
                    <span style={{
                      width: 32, flexShrink: 0, textAlign: 'center', fontSize: 11,
                      color: '#94a3b8', background: 'rgba(0,0,0,0.03)',
                      padding: '0', borderRight: '1px solid rgba(0,0,0,0.06)', alignSelf: 'stretch',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      userSelect: 'none',
                    }}>
                      {i + 1}
                    </span>
                    {/* +/- prefix */}
                    <span style={{ width: 22, flexShrink: 0, textAlign: 'center', fontSize: 14, fontWeight: 700, color: line.fg, userSelect: 'none' }}>
                      {line.prefix}
                    </span>
                    {/* Path (monospace, bold) */}
                    <span style={{ fontSize: 12, fontWeight: 600, color: line.fg, minWidth: 120, flexShrink: 0, paddingRight: 8 }}>
                      {line.path}
                    </span>
                    {/* Description (readable prose) */}
                    <span style={{ fontSize: 12, color: line.fg, opacity: 0.75, flex: 1, fontFamily: 'system-ui, sans-serif' }}>
                      {line.description}
                    </span>
                    {/* Meta flags */}
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{Math.round(rc.confidence * 100)}%</span>
                      {diff.breakingScore > 0.5 && (
                        <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, background: '#fef2f2', padding: '1px 5px', borderRadius: 3 }}>breaking</span>
                      )}
                      {rc.llmRequired ? (
                        <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, background: '#faf5ff', padding: '1px 5px', borderRadius: 3 }}>⚡ llm</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, background: '#f0fdf4', padding: '1px 5px', borderRadius: 3 }}>✓ auto</span>
                      )}
                    </div>
                  </div>
                  {/* llmReason as sub-line when present */}
                  {rc.llmRequired && rc.llmReason && li === 0 && (
                    <div style={{ paddingLeft: 54, paddingBottom: 5, fontSize: 11, color: '#7c3aed', fontFamily: 'system-ui, sans-serif', opacity: 0.8 }}>
                      {rc.llmReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AIAnalysis = {
  action: 'renamed_to' | 'truly_removed' | 'type_changed' | 'moved_to_nested' | 'needs_investigation';
  suggestion: string;
  confidence: number;
  reasoning: string;
};

const ACTION_LABEL: Record<AIAnalysis['action'], { label: string; color: string; bg: string }> = {
  renamed_to:          { label: '↪ Renamed',        color: '#7c3aed', bg: '#faf5ff' },
  truly_removed:       { label: '✕ Truly removed',  color: '#dc2626', bg: '#fef2f2' },
  type_changed:        { label: '~ Type changed',   color: '#d97706', bg: '#fffbeb' },
  moved_to_nested:     { label: '→ Moved/nested',   color: '#2563eb', bg: '#eff6ff' },
  needs_investigation: { label: '? Unclear',         color: '#6b7280', bg: '#f8fafc' },
};

function LLMEscalationsSection({
  escalations,
  incidentId,
  preComputed,
}: {
  escalations: LLMEscalation[];
  incidentId: string;
  preComputed: LLMAnalysisResult[];
}) {
  // Seed state with any analysis already stored in Postgres
  const [analyses, setAnalyses] = useState<Record<number, AIAnalysis>>(() => {
    const seed: Record<number, AIAnalysis> = {};
    for (const r of preComputed) {
      seed[r.escalationIndex] = { action: r.action, suggestion: r.suggestion, confidence: r.confidence, reasoning: r.reasoning };
    }
    return seed;
  });
  const [loading,  setLoading]    = useState<number | null>(null);
  const [errors,   setErrors]     = useState<Record<number, string>>({});

  if (!escalations.length) return null;

  const analyze = async (index: number) => {
    setLoading(index);
    setErrors(prev => { const e = { ...prev }; delete e[index]; return e; });
    try {
      const result = await fetchAdminJson<{ success: boolean; data: AIAnalysis }>(
        `/api/drift/incidents/${incidentId}/analyze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalationIndex: index }),
        },
      );
      setAnalyses(prev => ({ ...prev, [index]: result.data }));
    } catch (e) {
      setErrors(prev => ({ ...prev, [index]: e instanceof Error ? e.message : 'Error' }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
        ⚡ Needs AI analysis ({escalations.length})
        <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', textTransform: 'none' }}>
          — deterministic engine couldn't resolve these
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {escalations.map((esc, i) => {
          const analysis = analyses[i];
          const isLoading = loading === i;
          const err = errors[i];
          const actionMeta = analysis ? ACTION_LABEL[analysis.action] : null;

          return (
            <div key={i} style={{
              borderRadius: 8, border: '1px solid #ddd6fe', overflow: 'hidden',
              background: '#fff',
            }}>
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', background: '#faf5ff', borderBottom: analysis ? '1px solid #ddd6fe' : 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', flexShrink: 0 }}>
                  {esc.diff.kind.replace(/_/g, ' ')}
                </span>
                <code style={{ fontSize: 12, color: '#5b21b6', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {esc.diff.pathA ?? esc.diff.pathB ?? '—'}
                </code>
                <span style={{ fontSize: 11, color: '#7c3aed', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {esc.reason}
                </span>
                {!analysis && (
                  <button
                    disabled={isLoading}
                    onClick={() => void analyze(i)}
                    style={{
                      padding: '5px 12px', borderRadius: 5, border: '1px solid #7c3aed',
                      background: isLoading ? '#f5f3ff' : '#7c3aed', color: isLoading ? '#7c3aed' : '#fff',
                      fontSize: 11, fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer',
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {isLoading
                      ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
                      : '⚡ Analyze with AI'}
                  </button>
                )}
                {analysis && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0, background: actionMeta!.bg, color: actionMeta!.color }}>
                    {actionMeta!.label}
                  </span>
                )}
              </div>

              {/* AI result */}
              {analysis && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #ede9fe' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                        {analysis.suggestion}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        {analysis.reasoning}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: analysis.confidence >= 0.75 ? '#16a34a' : analysis.confidence >= 0.5 ? '#d97706' : '#dc2626' }}>
                        {Math.round(analysis.confidence * 100)}%
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>confidence</div>
                    </div>
                  </div>
                  <button
                    onClick={() => void analyze(i)}
                    style={{ marginTop: 8, padding: '3px 10px', borderRadius: 4, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontSize: 11, cursor: 'pointer' }}
                  >
                    Re-analyze
                  </button>
                </div>
              )}

              {/* Error */}
              {err && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#dc2626', borderTop: '1px solid #fecaca', background: '#fef2f2' }}>
                  {err} —{' '}
                  <button onClick={() => void analyze(i)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>retry</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Incidents() {
  const [incidents, setIncidents]   = useState<DriftIncident[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<string | null>(null);
  const [updating, setUpdating]     = useState<string | null>(null);
  const [remediating, setRemediating] = useState<string | null>(null);

  const [filterSeverity, setFilterSeverity] = useState<DriftSeverity | 'all'>('all');
  const [filterStatus,   setFilterStatus]   = useState<IncidentStatus | 'all'>('open');
  const [filterProtocol, setFilterProtocol] = useState<DriftProtocol | 'all'>('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterSeverity !== 'all') params.set('severity', filterSeverity);
      if (filterStatus   !== 'all') params.set('status',   filterStatus);
      if (filterProtocol !== 'all') params.set('protocol', filterProtocol);
      params.set('limit', '100');

      const data = await fetchAdminJson<{ success: boolean; data: DriftIncident[] }>(
        `/api/drift/incidents?${params}`,
      );
      setIncidents(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterStatus, filterProtocol]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: IncidentStatus) => {
    setUpdating(id);
    try {
      await fetchAdminJson(`/api/drift/incidents/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      if (status === 'resolved' || status === 'dismissed') setSelected(null);
    } catch {
      // leave current state on failure
    } finally {
      setUpdating(null);
    }
  };

  const startRemediation = async (id: string) => {
    setRemediating(id);
    try {
      const result = await fetchAdminJson<{ success: boolean; data: { started: number; failed: number; total: number } }>(
        `/api/drift/incidents/${id}/remediate`,
        { method: 'POST' },
      );
      if (result.success) {
        const { started, total } = result.data;
        alert(`Remediation started for ${started}/${total} tenant(s). Affected tenants are now in maintenance mode.`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Remediation failed');
    } finally {
      setRemediating(null);
    }
  };

  const summary = {
    critical: incidents.filter(i => i.severity === 'critical' && i.status === 'open').length,
    major:    incidents.filter(i => i.severity === 'major'    && i.status === 'open').length,
    total:    incidents.filter(i => i.status === 'open').length,
    resolved: incidents.filter(i => i.status === 'resolved').length,
  };

  const filtered = incidents.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    if (filterStatus   !== 'all' && i.status   !== filterStatus)   return false;
    if (filterProtocol !== 'all' && i.protocol  !== filterProtocol) return false;
    return true;
  });

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>Schema Drift Incidents</h1>
          <p className="page-subtitle">
            Detected by schema-bridge · SQL · OpenAPI · Avro · CSV · JSONL · XML · SOAP · GraphQL · Parquet · Protobuf
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
          }}
        >
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
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
          <div className="stat-value" style={{ color: '#16a34a' }}>{summary.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { label: 'SEVERITY', value: filterSeverity, setter: setFilterSeverity,
            options: [['all','All severities'],['critical','Critical'],['major','Major'],['minor','Minor']] },
          { label: 'STATUS',   value: filterStatus,   setter: setFilterStatus,
            options: [['all','All statuses'],['open','Open'],['investigating','Investigating'],['resolved','Resolved'],['dismissed','Dismissed']] },
          { label: 'PROTOCOL', value: filterProtocol, setter: setFilterProtocol,
            options: [['all','All protocols'],['sql','SQL'],['openapi','OpenAPI'],['avro','Avro'],['csv','CSV'],['jsonl','JSONL'],['xml','XML'],['soap','SOAP'],['graphql','GraphQL'],['parquet','Parquet'],['protobuf','Protobuf']] },
        ] as const).map(({ label, value, setter, options }) => (
          <div key={label}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>
              {label}
            </label>
            <select
              value={value}
              onChange={e => (setter as (v: string) => void)(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
            >
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>
          {error} —{' '}
          <button onClick={() => void load()} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 600 }}>No incidents match the current filters</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Submit schemas via <code>POST /api/drift/ingest</code> to start detecting drift
          </div>
        </div>
      )}

      {/* Incident list */}
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map(incident => {
          const isOpen      = selected === incident.id;
          const isUpdating  = updating === incident.id;
          const isRemediating = remediating === incident.id;
          const sc          = SEVERITY_COLOR[incident.severity];
          const pc          = PROTOCOL_COLOR[incident.protocol];
          const report      = incident.bridgeReport;
          const conflicts   = report?.resolvedConflicts ?? [];
          const reqReport   = report?.requirementsReport;
          const llmEscalations = reqReport?.llmEscalations ?? [];
          const summary     = reqReport?.summary;
          const fpA         = report?.inferredSchemaA?.fingerprint;
          const fpB         = report?.inferredSchemaB?.fingerprint;
          const llmCount    = summary?.llmEscalationCount ?? 0;
          const autoCount   = summary?.resolvedDeterministically ?? 0;
          const canRemediate = incident.routingTarget === 'incident_alert' && incident.affectedTenants.length > 0;

          return (
            <div
              key={incident.id}
              style={{
                background: '#fff',
                borderRadius: 8,
                border: `1px solid ${isOpen ? sc : '#e2e8f0'}`,
                borderLeft: `4px solid ${sc}`,
                overflow: 'hidden',
                boxShadow: isOpen ? '0 2px 10px rgba(0,0,0,0.08)' : 'none',
                transition: 'box-shadow 0.15s',
              }}
            >
              {/* Row — click to expand */}
              <div
                onClick={() => setSelected(isOpen ? null : incident.id)}
                style={{ padding: '12px 14px', cursor: 'pointer' }}
              >
                {/* Line 1: badges + time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <Badge label={incident.severity} color={sc} />

                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                    {incident.sourceId}
                  </span>

                  <Badge label={incident.protocol.toUpperCase()} color={pc} />
                  <Badge label={incident.status} color={STATUS_COLOR[incident.status]} />

                  {incident.impactScore !== null && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                      background: '#0f172a', color: '#fff',
                    }}>
                      {Math.round(incident.impactScore * 100)}%
                    </span>
                  )}

                  {incident.affectedTenants.length > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                      background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa',
                    }}>
                      ⚠ {incident.affectedTenants.length} tenant{incident.affectedTenants.length !== 1 ? 's' : ''}
                    </span>
                  )}

                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>
                    {timeAgo(incident.detectedAt)}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {/* Line 2: change summary */}
                <div style={{ marginTop: 5, fontSize: 13, color: '#475569' }}>
                  {changeSummary(conflicts)}
                </div>

                {/* Line 3: fingerprint delta + resolution stats */}
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {fpA && fpB && (
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
                      <span style={{ color: '#dc2626' }}>{shortFingerprint(fpA)}</span>
                      {' → '}
                      <span style={{ color: '#16a34a' }}>{shortFingerprint(fpB)}</span>
                    </span>
                  )}
                  {(autoCount > 0 || llmCount > 0) && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {autoCount > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>{autoCount} auto</span>}
                      {autoCount > 0 && llmCount > 0 && <span style={{ color: '#94a3b8' }}> · </span>}
                      {llmCount > 0 && (
                        incident.llmAnalysis.length >= llmCount
                          ? <span style={{ color: '#7c3aed', fontWeight: 600 }}>⚡ {llmCount} AI analyzed</span>
                          : <span style={{ color: '#7c3aed', fontWeight: 600 }}>{llmCount} pending LLM</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div style={{ padding: '0 14px 16px', borderTop: '1px solid #f1f5f9' }}>

                  {/* Fingerprint delta + routing */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {fpA && fpB && (
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                        <span style={{ color: '#dc2626' }}>{shortFingerprint(fpA)}</span>
                        {' → '}
                        <span style={{ color: '#16a34a' }}>{shortFingerprint(fpB)}</span>
                      </div>
                    )}
                    {incident.routingTarget && (
                      <div style={{
                        padding: '4px 10px', borderRadius: 6, background: '#f8fafc',
                        border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#374151',
                      }}>
                        {incident.routingTarget === 'incident_alert'  && '🚨 Incident Alert'}
                        {incident.routingTarget === 'operator_review' && '👤 Operator Review'}
                        {incident.routingTarget === 'timeline_trace'  && '📋 Timeline Trace'}
                        {incident.routingTarget === 'auto_resolved'   && '✅ Auto-resolved'}
                      </div>
                    )}
                    {incident.affectedTenants.length > 0 && (
                      <div style={{ fontSize: 12, color: '#64748b', padding: '4px 10px', background: '#fff7ed', borderRadius: 6, border: '1px solid #fed7aa' }}>
                        ⚠ {incident.affectedTenants.length} tenant{incident.affectedTenants.length !== 1 ? 's' : ''} in blast radius:{' '}
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{incident.affectedTenants.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {/* Resolution summary bar */}
                  <ResolutionSummary report={reqReport} />

                  {/* Remediation hints */}
                  {incident.remediationHints.length > 0 && (
                    <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Remediation Hints
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {incident.remediationHints.map((h, i) => (
                          <li key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 2 }}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Diff table */}
                  <DiffTable conflicts={conflicts} />

                  {/* LLM escalations with promptSeeds */}
                  <LLMEscalationsSection escalations={llmEscalations} incidentId={incident.id} preComputed={incident.llmAnalysis} />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Start Remediation — only if incident_alert + blast radius */}
                    {canRemediate && incident.status !== 'resolved' && incident.status !== 'dismissed' && (
                      <button
                        disabled={isRemediating}
                        onClick={e => { e.stopPropagation(); void startRemediation(incident.id); }}
                        style={{
                          padding: '7px 14px', borderRadius: 6, border: '1px solid #dc2626',
                          background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700,
                          cursor: isRemediating ? 'not-allowed' : 'pointer',
                          opacity: isRemediating ? 0.6 : 1,
                        }}
                      >
                        {isRemediating ? 'Starting…' : '🚨 Start Remediation'}
                      </button>
                    )}

                    {incident.status === 'open' && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'investigating'); }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid #d97706',
                          background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1,
                        }}
                      >
                        Mark Investigating
                      </button>
                    )}
                    {(incident.status === 'open' || incident.status === 'investigating') && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'resolved'); }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid #16a34a',
                          background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1,
                        }}
                      >
                        Resolve
                      </button>
                    )}
                    {incident.status === 'open' && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'dismissed'); }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                          background: '#f8fafc', color: '#6b7280', fontSize: 12, fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1,
                        }}
                      >
                        Dismiss
                      </button>
                    )}
                    {(isUpdating || isRemediating) && (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Saving…</span>
                    )}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

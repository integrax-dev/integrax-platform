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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import { useAuthStore } from '../stores/auth';
import { usePlatformStream, type PlatformEvent } from '../lib/usePlatformStream';
import { ToastContainer, type ToastItem } from '../components/Toast';
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
  critical: '#ef4444',
  major:    '#f59e0b',
  minor:    '#6366f1',
};

const STATUS_COLOR: Record<IncidentStatus, string> = {
  open:          '#ef4444',
  investigating: '#f59e0b',
  resolved:      '#10b981',
  dismissed:     '#94a3b8',
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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function shortFingerprint(fp?: string): string {
  if (!fp) return '—';
  return fp.length > 10 ? fp.slice(0, 8) + '…' : fp;
}

/** Converts a raw sourceId like "source_open" to "Source Open" */
function formatSourceId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Generates the one-liner summary shown in the collapsed row */
function changeSummary(conflicts: ResolvedConflict[], t: TFn): string {
  if (!conflicts.length) return t('incidents.noChanges');
  const first = conflicts[0];
  const { kind, pathA, pathB } = first.diff;
  const name = pathA ?? pathB ?? '';
  const desc = (() => {
    switch (kind) {
      case 'field_removed':    return t('incidents.diffFieldRemoved', { name });
      case 'field_added':      return t('incidents.diffFieldAdded', { name });
      case 'type_changed':     return t('incidents.diffTypeChanged', { name });
      case 'rename_candidate': return t('incidents.diffRenameCandidate', { a: pathA, b: pathB });
      default:                 return t('incidents.diffDefaultKind', { kind: kind.replace(/_/g, ' '), name });
    }
  })();
  const rest = conflicts.length - 1;
  const more = rest > 0 ? t('incidents.moreChanges', { count: rest }) : '';
  return t('incidents.changeSummary', { count: conflicts.length, desc, more });
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
  const { t } = useTranslation();
  if (!report) return null;
  const s = report.summary;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {s.resolvedDeterministically > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(16,185,129,0.25)' }}>
          {t('incidents.autoResolvedCount', { count: s.resolvedDeterministically })}
        </span>
      )}
      {s.llmEscalationCount > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(139,92,246,0.25)' }}>
          {t('incidents.pendingLlmCount', { count: s.llmEscalationCount })}
        </span>
      )}
      {s.breakingCount > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(239,68,68,0.08)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)' }}>
          {t('incidents.breakingCount', { count: s.breakingCount })}
        </span>
      )}
    </div>
  );
}

/** Converts a diff kind + paths into a human-readable description line */
function diffDescription(kind: string, pathA: string | null, pathB: string | null, t: TFn): string {
  const a = pathA ?? '?';
  const b = pathB ?? '?';
  switch (kind) {
    case 'field_removed':    return t('incidents.diffRemovedDesc', { name: a });
    case 'field_added':      return t('incidents.diffAddedDesc', { name: b });
    case 'type_changed':     return t('incidents.diffTypeDesc', { name: a });
    case 'rename_candidate': return t('incidents.diffRenameCandidate', { a, b });
    default:                 return `${kind.replace(/_/g, ' ')} on "${a}"`;
  }
}

/** GitHub-style diff with human-readable descriptions (like Antigraviity had) */
function DiffTable({ conflicts }: { conflicts: ResolvedConflict[] }) {
  const { t } = useTranslation();
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
        {t('incidents.schemaDiffsHeader', { count: conflicts.length })}
      </div>
      <div style={{
        borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden',
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      }}>
        {/* Section header */}
        <div style={{ background: '#f6f8fa', borderBottom: '1px solid #e2e8f0', padding: '5px 14px', fontSize: 12, color: '#57606a', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{t('incidents.schemaDiffsTitle')}</span>
          <span>{t('incidents.schemaDiffsChanges', { count: conflicts.length })}</span>
        </div>

        {conflicts.map((rc, i) => {
          const { diff } = rc;
          const lines: DiffLine[] = [];

          if (diff.kind === 'field_removed') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB, t), bg: '#ffeef0', fg: '#b91c1c', borderLeft: '#dc2626' });
          } else if (diff.kind === 'field_added') {
            lines.push({ prefix: '+', path: diff.pathB ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB, t), bg: '#e6ffed', fg: '#15803d', borderLeft: '#16a34a' });
          } else if (diff.kind === 'rename_candidate') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: t('incidents.diffRenameWas', { name: diff.pathA }), bg: '#ffeef0', fg: '#b91c1c', borderLeft: '#dc2626' });
            lines.push({ prefix: '+', path: diff.pathB ?? '?', description: t('incidents.diffRenameNow', { name: diff.pathB }), bg: '#e6ffed', fg: '#15803d', borderLeft: '#16a34a' });
          } else if (diff.kind === 'type_changed') {
            lines.push({ prefix: '-', path: diff.pathA ?? '?', description: t('incidents.diffTypeBefore', { name: diff.pathA }), bg: '#fff8f1', fg: '#c2410c', borderLeft: '#f97316' });
            lines.push({ prefix: '+', path: diff.pathB ?? diff.pathA ?? '?', description: t('incidents.diffTypeAfter', { name: diff.pathB ?? diff.pathA }), bg: '#f0fdf4', fg: '#15803d', borderLeft: '#22c55e' });
          } else {
            lines.push({ prefix: '~', path: diff.pathA ?? diff.pathB ?? '?', description: diffDescription(diff.kind, diff.pathA, diff.pathB, t), bg: '#fffbeb', fg: '#92400e', borderLeft: '#d97706' });
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
                        <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, background: 'rgba(239,68,68,0.08)', padding: '1px 5px', borderRadius: 3 }}>{t('incidents.breakingLabel')}</span>
                      )}
                      {rc.llmRequired ? (
                        <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, background: '#faf5ff', padding: '1px 5px', borderRadius: 3 }}>{t('incidents.llmLabel')}</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#059669', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: 3 }}>{t('incidents.autoLabel')}</span>
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

const ACTION_COLOR: Record<AIAnalysis['action'], { color: string; bg: string }> = {
  renamed_to:          { color: '#7c3aed', bg: '#faf5ff' },
  truly_removed:       { color: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
  type_changed:        { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  moved_to_nested:     { color: '#6366f1', bg: 'rgba(99,102,241,0.06)' },
  needs_investigation: { color: '#6b7280', bg: '#f8fafc' },
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
  const { t } = useTranslation();
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
      const msg = e instanceof Error ? e.message : 'Error';
      // HTTP_503 fallback if backend didn't return a structured error body
      const friendly = msg === 'HTTP_503'
        ? 'LLM unavailable — add ANTHROPIC_API_KEY to control-plane/.env'
        : msg === 'HTTP_502' || msg === 'HTTP_504'
          ? 'LLM service not responding'
          : msg;
      setErrors(prev => ({ ...prev, [index]: friendly }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('incidents.needsAiAnalysis', { count: escalations.length })}
        <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', textTransform: 'none' }}>
          {t('incidents.deterministicNote')}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {escalations.map((esc, i) => {
          const analysis = analyses[i];
          const isLoading = loading === i;
          const err = errors[i];
          const actionMeta = analysis ? { ...ACTION_COLOR[analysis.action], label: t(`incidents.action.${analysis.action}`) } : null;

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
                  {t(`incidents.kind.${esc.diff.kind}`, { defaultValue: esc.diff.kind.replace(/_/g, ' ') } as Record<string, unknown>)}
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
                      ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> {t('incidents.analyzing')}</>
                      : t('incidents.analyzeWithAi')}
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {analysis.suggestion}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        {analysis.reasoning}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: analysis.confidence >= 0.75 ? '#10b981' : analysis.confidence >= 0.5 ? '#f59e0b' : '#ef4444' }}>
                        {Math.round(analysis.confidence * 100)}%
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{t('incidents.confidence')}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => void analyze(i)}
                    style={{ marginTop: 8, padding: '3px 10px', borderRadius: 4, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontSize: 11, cursor: 'pointer' }}
                  >
                    {t('incidents.reAnalyze')}
                  </button>
                </div>
              )}

              {/* Error */}
              {err && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>⚠</span>
                    <span style={{ fontSize: 12, color: '#dc2626' }}>{err}</span>
                  </div>
                  <button onClick={() => void analyze(i)} style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: 'none', border: '1px solid #ddd6fe', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>
                    {t('incidents.retryBtn')}
                  </button>
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
  const { t } = useTranslation();
  const [incidents, setIncidents]   = useState<DriftIncident[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<string | null>(null);
  const [updating, setUpdating]     = useState<string | null>(null);
  const [remediating, setRemediating] = useState<string | null>(null);
  const [toasts, setToasts]         = useState<ToastItem[]>([]);

  const [filterSeverity, setFilterSeverity] = useState<DriftSeverity | 'all'>('all');
  const [filterStatus,   setFilterStatus]   = useState<IncidentStatus | 'all'>('all');
  const [filterProtocol, setFilterProtocol] = useState<DriftProtocol | 'all'>('all');

  // ── SSE: real-time incident push ─────────────────────────────────────────────
  const getToken = useCallback(() => useAuthStore.getState().token, []);

  usePlatformStream({
    getToken,
    handlers: useMemo(() => ({
      'incident.created': (env: PlatformEvent) => {
        const incident = env.data as DriftIncident;
        setIncidents(prev => {
          if (prev.find(i => i.id === incident.id)) return prev;
          return [incident, ...prev];
        });
        if (incident.severity === 'critical' || incident.severity === 'major') {
          setToasts(prev => [...prev, {
            id: incident.id + '-' + Date.now(),
            severity: incident.severity,
            title: `${incident.severity === 'critical' ? 'Critical' : 'Major'} drift — ${incident.sourceId}`,
            body: `${incident.protocol.toUpperCase()} · ${incident.affectedTenants.length} tenant(s) affected`,
          } satisfies ToastItem]);
        }
      },
      'incident.updated': (env: PlatformEvent) => {
        const incident = env.data as DriftIncident;
        setIncidents(prev => {
          const idx = prev.findIndex(i => i.id === incident.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = incident;
          return next;
        });
      },
    }), []),
  });

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

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

  const ACTIVE_STATUSES: IncidentStatus[] = ['open', 'investigating'];
  const summary = {
    critical: incidents.filter(i => i.severity === 'critical' && ACTIVE_STATUSES.includes(i.status)).length,
    major:    incidents.filter(i => i.severity === 'major'    && ACTIVE_STATUSES.includes(i.status)).length,
    total:    incidents.filter(i => ACTIVE_STATUSES.includes(i.status)).length,
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
          <h1>{t('incidents.title')}</h1>
          <p className="page-subtitle">{t('incidents.subtitle')}</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn btn-secondary"
        >
          {loading ? t('common.loading') : t('incidents.refresh')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 8 }}>
        {([
          { id: 'critical-active', labelKey: 'incidents.criticalActive', value: summary.critical, color: '#ef4444' },
          { id: 'major-active',    labelKey: 'incidents.majorActive',    value: summary.major,    color: '#f59e0b' },
          { id: 'total-active',    labelKey: 'incidents.totalActive',    value: summary.total,    color: '#6366f1' },
          { id: 'resolved',        labelKey: 'incidents.status.resolved', value: summary.resolved, color: '#10b981' },
        ] as const).map(({ id, labelKey, value, color }) => (
          <div key={id} data-testid={`incidents-summary-${id}`} style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid var(--border-color)',
            borderLeft: `4px solid ${color}`,
            display: 'flex', flexDirection: 'column' as const, gap: 2,
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color }}>
              {value}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              {t(labelKey)}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {([
          { id: 'severity', labelKey: 'incidents.severityLabel', value: filterSeverity, setter: setFilterSeverity,
            options: [['all', t('common.all')],['critical', t('incidents.severity.critical')],['major', t('incidents.severity.major')],['minor', t('incidents.severity.minor')]] as [string,string][] },
          { id: 'status', labelKey: 'common.status', value: filterStatus, setter: setFilterStatus,
            options: [['all', t('common.all')],['open', t('incidents.status.open')],['investigating', t('incidents.status.investigating')],['resolved', t('incidents.status.resolved')],['dismissed', t('incidents.status.dismissed')]] as [string,string][] },
          { id: 'protocol', labelKey: 'incidents.protocolLabel', value: filterProtocol, setter: setFilterProtocol,
            options: [['all', t('common.all')],['sql','SQL'],['openapi','OpenAPI'],['avro','Avro'],['csv','CSV'],['jsonl','JSONL'],['xml','XML'],['soap','SOAP'],['graphql','GraphQL'],['parquet','Parquet'],['protobuf','Protobuf']] as [string,string][] },
        ]).map(({ id, labelKey, value, setter, options }) => {
          const selectId = `incidents-filter-${id}`;
          return (
          <div key={labelKey} style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            <label htmlFor={selectId} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
              {t(labelKey)}
            </label>
            <select
              id={selectId}
              data-testid={selectId}
              value={value}
              onChange={e => (setter as (v: string) => void)(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                fontSize: 13, background: '#fff', color: 'var(--text-primary)',
                cursor: 'pointer', outline: 'none', minWidth: 110,
              }}
            >
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 14, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>
          {error} —{' '}
          <button onClick={() => void load()} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {t('common.retry').toLowerCase()}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', background: '#fff', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.6 }}>✓</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('incidents.noIncidents')}</div>
          <div style={{ fontSize: 13 }}>
            {t('incidents.noIncidentsDesc')}
          </div>
        </div>
      )}

      {/* Real-time toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
              data-testid={`incident-card-${incident.id}`}
              style={{
                background: '#fff',
                borderRadius: 10,
                border: `1px solid ${isOpen ? sc + '55' : 'var(--border-color)'}`,
                borderLeft: `4px solid ${sc}`,
                overflow: 'hidden',
                boxShadow: isOpen ? `0 0 0 3px ${sc}18, 0 4px 12px rgba(0,0,0,0.06)` : '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
            >
              {/* Row — click to expand */}
              <div
                onClick={() => setSelected(isOpen ? null : incident.id)}
                style={{ padding: '14px 16px', cursor: 'pointer' }}
              >
                {/* Line 1: severity · source · protocol · status · tenants · time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
                  <Badge label={t(`incidents.severity.${incident.severity}`)} color={sc} />

                  <span style={{
                    fontWeight: 500, fontSize: 13,
                    color: 'var(--text-primary)',
                    flexShrink: 0, whiteSpace: 'nowrap' as const,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 3 }}>
                      {t('incidents.sourceLabel')}:
                    </span>
                    {formatSourceId(incident.sourceId)}
                  </span>

                  <Badge label={incident.protocol.toUpperCase()} color={pc} />
                  <Badge label={t(`incidents.status.${incident.status}`)} color={STATUS_COLOR[incident.status]} />

                  {incident.affectedTenants.length > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                      background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.22)',
                      whiteSpace: 'nowrap' as const,
                    }}>
                      ⚠ {incident.affectedTenants.length} tenant{incident.affectedTenants.length !== 1 ? 's' : ''}
                    </span>
                  )}

                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {timeAgo(incident.detectedAt)}
                    </span>
                    <span style={{ fontSize: 11, color: '#cbd5e1' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Line 2: change summary */}
                <div style={{
                  marginTop: 6, fontSize: 13, color: 'var(--text-secondary)',
                  lineHeight: 1.4, paddingRight: 8,
                }}>
                  {changeSummary(conflicts, t)}
                </div>

                {/* Line 3: resolution stats */}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {autoCount > 0 && (
                    <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                      {t('incidents.autoStat', { count: autoCount })}
                    </span>
                  )}
                  {llmCount > 0 && (
                    <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>
                      {incident.llmAnalysis.length >= llmCount
                        ? t('incidents.aiAnalyzed', { count: llmCount })
                        : t('incidents.pendingLlmStat', { count: llmCount })}
                    </span>
                  )}
                  {incident.impactScore !== null && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {t('incidents.impactLabel')} <strong style={{ color: 'var(--text-primary)' }}>{Math.round(incident.impactScore * 100)}%</strong>
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
                        <span style={{ color: '#ef4444' }}>{shortFingerprint(fpA)}</span>
                        {' → '}
                        <span style={{ color: '#10b981' }}>{shortFingerprint(fpB)}</span>
                      </div>
                    )}
                    {incident.routingTarget && (
                      <div style={{
                        padding: '4px 10px', borderRadius: 6, background: '#f8fafc',
                        border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                      }}>
                        {incident.routingTarget === 'incident_alert'  && t('incidents.routingIncidentAlert')}
                        {incident.routingTarget === 'operator_review' && t('incidents.routingOperatorReview')}
                        {incident.routingTarget === 'timeline_trace'  && t('incidents.routingTimelineTrace')}
                        {incident.routingTarget === 'auto_resolved'   && t('incidents.routingAutoResolved')}
                      </div>
                    )}
                    {incident.affectedTenants.length > 0 && (
                      <div style={{ fontSize: 12, color: '#d97706', padding: '4px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
                        {t('incidents.tenantBlastRadius', { count: incident.affectedTenants.length })}{' '}
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{incident.affectedTenants.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {/* Resolution summary bar */}
                  <ResolutionSummary report={reqReport} />

                  {/* Remediation hints */}
                  {incident.remediationHints.length > 0 && (
                    <div style={{ marginTop: 12, padding: 10, background: 'rgba(245,158,11,0.06)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('incidents.remediationHints')}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {incident.remediationHints.map((h, i) => (
                          <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{h}</li>
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
                          padding: '7px 14px', borderRadius: 6, border: '1px solid #ef4444',
                          background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700,
                          cursor: isRemediating ? 'not-allowed' : 'pointer',
                          opacity: isRemediating ? 0.6 : 1,
                        }}
                      >
                        {isRemediating ? t('incidents.starting') : `🚨 ${t('incidents.startRemediation')}`}
                      </button>
                    )}

                    {incident.status === 'open' && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'investigating'); }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.4)',
                          background: 'rgba(245,158,11,0.08)', color: '#d97706', fontSize: 12, fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1,
                        }}
                      >
                        {t('incidents.markInvestigating')}
                      </button>
                    )}
                    {(incident.status === 'open' || incident.status === 'investigating') && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'resolved'); }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.4)',
                          background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: 12, fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1,
                        }}
                      >
                        {t('incidents.resolve')}
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
                        {t('incidents.dismiss')}
                      </button>
                    )}
                    {(isUpdating || isRemediating) && (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{t('incidents.saving')}</span>
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

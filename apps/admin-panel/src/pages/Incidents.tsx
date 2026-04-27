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
import { Link } from 'react-router-dom';
import { fetchAdminJson } from '../lib/adminApi';
import { useAuthStore } from '../stores/auth';
import { usePlatformStream, type PlatformEvent } from '../lib/usePlatformStream';
import { ToastContainer, type ToastItem } from '../components/Toast';
import './Pages.css';
import './Incidents.css';

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
  remediationHints: Array<{ key: string; params: Record<string, string> }>;
  affectedTenants: string[];
  /** Pre-computed LLM analysis — auto-populated for critical incidents on ingest,
   *  on-demand for others. Empty array means not yet analyzed. */
  llmAnalysis: LLMAnalysisResult[];
  detectedAt: string;
  resolvedAt: string | null;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<DriftSeverity, string> = {
  critical: 'var(--color-error)',
  major:    'var(--color-warning)',
  minor:    'var(--color-primary)',
};

const STATUS_COLOR: Record<IncidentStatus, string> = {
  open:          'var(--color-error)',
  investigating: 'var(--color-warning)',
  resolved:      'var(--color-success)',
  dismissed:     'var(--text-muted)',
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

function formatSourceId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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

function Badge({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <span className="badge-dynamic" style={{ background: bg ?? (color + '18'), color }}>
      {label}
    </span>
  );
}

function ResolutionSummary({ report }: { report: RequirementsReport | undefined }) {
  const { t } = useTranslation();
  if (!report) return null;
  const s = report.summary;
  return (
    <div className="resolution-summary">
      {s.resolvedDeterministically > 0 && (
        <span className="res-chip res-chip-auto">
          {t('incidents.autoResolvedCount', { count: s.resolvedDeterministically })}
        </span>
      )}
      {s.llmEscalationCount > 0 && (
        <span className="res-chip res-chip-llm">
          {t('incidents.pendingLlmCount', { count: s.llmEscalationCount })}
        </span>
      )}
      {s.breakingCount > 0 && (
        <span className="res-chip res-chip-breaking">
          {t('incidents.breakingCount', { count: s.breakingCount })}
        </span>
      )}
    </div>
  );
}

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
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        {t('incidents.schemaDiffsHeader', { count: conflicts.length })}
      </div>
      <div className="diff-viewer-table">
        <div className="diff-file-header">
          <span>{t('incidents.schemaDiffsTitle')}</span>
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
            <div key={i} className="diff-hunk">
              {lines.map((line, li) => (
                <div key={li} className="diff-line" style={{ background: line.bg, borderLeftColor: line.borderLeft }}>
                  <span className="diff-line-num">{i + 1}</span>
                  <span className="diff-prefix" style={{ color: line.fg }}>{line.prefix}</span>
                  <span className="diff-path"    style={{ color: line.fg }}>{line.path}</span>
                  <span className="diff-desc"    style={{ color: line.fg }}>{line.description}</span>
                  <div className="diff-meta">
                    <span className="diff-confidence">{Math.round(rc.confidence * 100)}%</span>
                    {diff.breakingScore > 0.5 && (
                      <span className="diff-tag diff-tag-breaking">{t('incidents.breakingLabel')}</span>
                    )}
                    {rc.llmRequired
                      ? <span className="diff-tag diff-tag-llm">{t('incidents.llmLabel')}</span>
                      : <span className="diff-tag diff-tag-auto">{t('incidents.autoLabel')}</span>}
                  </div>
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
  moved_to_nested:     { color: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
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
  const { t, i18n } = useTranslation();
  const [analyses, setAnalyses] = useState<Record<number, AIAnalysis>>(() => {
    const seed: Record<number, AIAnalysis> = {};
    for (const r of preComputed) {
      seed[r.escalationIndex] = { action: r.action, suggestion: r.suggestion, confidence: r.confidence, reasoning: r.reasoning };
    }
    return seed;
  });
  const [loading, setLoading] = useState<number | null>(null);
  const [errors,  setErrors]  = useState<Record<number, string>>({});

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
          body: JSON.stringify({ escalationIndex: index, locale: i18n.language }),
        },
      );
      setAnalyses(prev => ({ ...prev, [index]: result.data }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
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
    <div className="llm-section">
      <div className="llm-section-title">
        {t('incidents.needsAiAnalysis', { count: escalations.length })}
        <span className="llm-note">{t('incidents.deterministicNote')}</span>
      </div>
      <div className="llm-cards">
        {escalations.map((esc, i) => {
          const analysis   = analyses[i];
          const isLoading  = loading === i;
          const err        = errors[i];
          const actionMeta = analysis ? { ...ACTION_COLOR[analysis.action], label: t(`incidents.action.${analysis.action}`) } : null;

          return (
            <div key={i} className="llm-card">
              <div className={`llm-card-header${analysis ? ' has-result' : ''}`}>
                <span className="llm-kind-tag">
                  {t(`incidents.kind.${esc.diff.kind}`, { defaultValue: esc.diff.kind.replace(/_/g, ' ') } as Record<string, unknown>)}
                </span>
                <div className="llm-card-info">
                  <code className="llm-card-path">{esc.diff.pathA ?? esc.diff.pathB ?? '—'}</code>
                  <span className="llm-card-reason">
                    {t(`incidents.escalationReason.${esc.diff.kind}`, {
                      field: esc.diff.pathA ?? esc.diff.pathB ?? '',
                      a: esc.diff.pathA ?? '',
                      b: esc.diff.pathB ?? '',
                      defaultValue: t('incidents.escalationReason.default'),
                    } as Record<string, unknown>)}
                  </span>
                </div>
                {!analysis && (
                  <button disabled={isLoading} onClick={() => void analyze(i)} className="llm-analyze-btn">
                    {isLoading
                      ? <><span className="spinner-sm" /> {t('incidents.analyzing')}</>
                      : t('incidents.analyzeWithAi')}
                  </button>
                )}
                {analysis && (
                  <span className="llm-action-tag" style={{ background: actionMeta!.bg, color: actionMeta!.color }}>
                    {actionMeta!.label}
                  </span>
                )}
              </div>

              {analysis && (
                <div className="llm-card-result">
                  <div className="llm-result-body">
                    <div className="llm-result-text">
                      <div className="llm-suggestion">{analysis.suggestion}</div>
                      <div className="llm-reasoning">{analysis.reasoning}</div>
                    </div>
                    <div className="llm-confidence">
                      <div
                        className="llm-confidence-value"
                        style={{ color: analysis.confidence >= 0.75 ? '#10b981' : analysis.confidence >= 0.5 ? '#f59e0b' : '#ef4444' }}
                      >
                        {Math.round(analysis.confidence * 100)}%
                      </div>
                      <div className="llm-confidence-label">{t('incidents.confidence')}</div>
                    </div>
                  </div>
                  <button onClick={() => void analyze(i)} className="llm-reanalyze-btn">
                    {t('incidents.reAnalyze')}
                  </button>
                </div>
              )}

              {err && (
                <div className="llm-card-error">
                  <div className="llm-error-msg">
                    <span className="llm-error-icon">⚠</span>
                    <span className="llm-error-text">{err}</span>
                  </div>
                  <button onClick={() => void analyze(i)} className="llm-retry-btn">
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
  const [incidents, setIncidents]     = useState<DriftIncident[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<string | null>(null);
  const [updating, setUpdating]       = useState<string | null>(null);
  const [remediating, setRemediating] = useState<string | null>(null);
  const [toasts, setToasts]           = useState<ToastItem[]>([]);

  const [filterSeverity, setFilterSeverity] = useState<DriftSeverity | 'all'>('all');
  const [filterStatus,   setFilterStatus]   = useState<IncidentStatus | 'all'>('all');
  const [filterProtocol, setFilterProtocol] = useState<DriftProtocol | 'all'>('all');

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

      <div className="page-header">
        <div>
          <h1>{t('incidents.title')}</h1>
          <p className="page-subtitle">{t('incidents.subtitle')}</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn btn-secondary">
          {loading ? t('common.loading') : t('incidents.refresh')}
        </button>
      </div>

      <div className="stats-grid">
        {([
          { id: 'critical-active', labelKey: 'incidents.criticalActive',  value: summary.critical, color: '#ef4444' },
          { id: 'major-active',    labelKey: 'incidents.majorActive',     value: summary.major,    color: '#f59e0b' },
          { id: 'total-active',    labelKey: 'incidents.totalActive',     value: summary.total,    color: 'var(--color-primary)' },
          { id: 'resolved',        labelKey: 'incidents.status.resolved', value: summary.resolved, color: '#10b981' },
        ] as const).map(({ id, labelKey, value, color }) => (
          <div key={id} data-testid={`incidents-summary-${id}`} className="stat-card" style={{ borderLeftColor: color }}>
            <div className="stat-card-value" style={{ color }}>{value}</div>
            <div className="stat-card-label">{t(labelKey)}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
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
            <div key={labelKey} className="filter-field">
              <label htmlFor={selectId} className="filter-label">{t(labelKey)}</label>
              <select
                id={selectId}
                data-testid={selectId}
                value={value}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                className="filter-select"
              >
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="alert alert-error">
          {error} —{' '}
          <button
            onClick={() => void load()}
            style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            {t('common.retry').toLowerCase()}
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.6 }}>✓</div>
          <strong>{t('incidents.noIncidents')}</strong>
          <p>{t('incidents.noIncidentsDesc')}</p>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map(incident => {
          const isOpen        = selected === incident.id;
          const isUpdating    = updating === incident.id;
          const isRemediating = remediating === incident.id;
          const sc            = SEVERITY_COLOR[incident.severity];
          const pc            = PROTOCOL_COLOR[incident.protocol];
          const report        = incident.bridgeReport;
          const conflicts     = report?.resolvedConflicts ?? [];
          const reqReport     = report?.requirementsReport;
          const llmEscalations = reqReport?.llmEscalations ?? [];
          const diffSummary   = reqReport?.summary;
          const fpA           = report?.inferredSchemaA?.fingerprint;
          const fpB           = report?.inferredSchemaB?.fingerprint;
          const llmCount      = diffSummary?.llmEscalationCount ?? 0;
          const autoCount     = diffSummary?.resolvedDeterministically ?? 0;
          const canRemediate  = incident.routingTarget === 'incident_alert' && incident.affectedTenants.length > 0;

          return (
            <div
              key={incident.id}
              data-testid={`incident-card-${incident.id}`}
              className="incident-card"
              style={{
                borderLeftColor: sc,
                borderColor: isOpen ? sc + '55' : undefined,
                boxShadow: isOpen ? `0 0 0 3px ${sc}18, 0 4px 12px rgba(0,0,0,0.06)` : undefined,
              }}
            >
              <div className="incident-card-row" onClick={() => setSelected(isOpen ? null : incident.id)}>
                <div className="incident-card-line1">
                  <Badge label={t(`incidents.severity.${incident.severity}`)} color={sc} />
                  <span className="incident-card-source">
                    <span className="incident-card-source-label">{t('incidents.sourceLabel')}:</span>
                    {formatSourceId(incident.sourceId)}
                  </span>
                  <Badge label={incident.protocol.toUpperCase()} color={pc} />
                  <Badge label={t(`incidents.status.${incident.status}`)} color={STATUS_COLOR[incident.status]} />
                  {incident.affectedTenants.length > 0 && (
                    <span className="incident-tenants-tag">
                      ⚠ {incident.affectedTenants.length} tenant{incident.affectedTenants.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div className="incident-card-meta">
                    <span className="incident-time">{timeAgo(incident.detectedAt)}</span>
                    <span className="incident-toggle">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                <div className="incident-card-summary">{changeSummary(conflicts, t)}</div>

                <div className="incident-stats-row">
                  {autoCount > 0 && (
                    <span className="incident-stat-auto">{t('incidents.autoStat', { count: autoCount })}</span>
                  )}
                  {llmCount > 0 && (
                    <span className="incident-stat-llm">
                      {incident.llmAnalysis.length >= llmCount
                        ? t('incidents.aiAnalyzed', { count: llmCount })
                        : t('incidents.pendingLlmStat', { count: llmCount })}
                    </span>
                  )}
                  {incident.impactScore !== null && (
                    <span className="incident-stat-impact">
                      {t('incidents.impactLabel')} <strong style={{ color: 'var(--text-primary)' }}>{Math.round(incident.impactScore * 100)}%</strong>
                    </span>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="incident-panel">

                  <div className="incident-panel-meta">
                    {fpA && fpB && (
                      <div className="fingerprint-delta">
                        <span className="fp-old">{shortFingerprint(fpA)}</span>
                        {' → '}
                        <span className="fp-new">{shortFingerprint(fpB)}</span>
                      </div>
                    )}
                    {incident.routingTarget && (
                      <div className="routing-tag">
                        {incident.routingTarget === 'incident_alert'  && t('incidents.routingIncidentAlert')}
                        {incident.routingTarget === 'operator_review' && t('incidents.routingOperatorReview')}
                        {incident.routingTarget === 'timeline_trace'  && t('incidents.routingTimelineTrace')}
                        {incident.routingTarget === 'auto_resolved'   && t('incidents.routingAutoResolved')}
                      </div>
                    )}
                    {incident.affectedTenants.length > 0 && (
                      <div className="blast-radius-tag">
                        {t('incidents.tenantBlastRadius', { count: incident.affectedTenants.length })}{' '}
                        <span className="blast-radius-ids">{incident.affectedTenants.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  <ResolutionSummary report={reqReport} />

                  {incident.remediationHints.length > 0 && (
                    <div className="remediation-hints-box">
                      <div className="remediation-hints-title">{t('incidents.remediationHints')}</div>
                      <ul className="remediation-hints-list">
                        {incident.remediationHints.map((h, i) => (
                          <li key={i}>{t(h.key, h.params as Record<string, unknown>)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <DiffTable conflicts={conflicts} />

                  <LLMEscalationsSection
                    escalations={llmEscalations}
                    incidentId={incident.id}
                    preComputed={incident.llmAnalysis}
                  />

                  <div className="incident-actions">
                    <Link
                      to={`/incidents/${incident.id}`}
                      onClick={e => e.stopPropagation()}
                      className="btn-dark"
                    >
                      Open detail
                    </Link>

                    {canRemediate && incident.status !== 'resolved' && incident.status !== 'dismissed' && (
                      <button
                        disabled={isRemediating}
                        onClick={e => { e.stopPropagation(); void startRemediation(incident.id); }}
                        className="btn-danger-solid"
                      >
                        {isRemediating ? t('incidents.starting') : `🚨 ${t('incidents.startRemediation')}`}
                      </button>
                    )}

                    {incident.status === 'open' && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'investigating'); }}
                        className="btn-tint-warning"
                      >
                        {t('incidents.markInvestigating')}
                      </button>
                    )}

                    {(incident.status === 'open' || incident.status === 'investigating') && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'resolved'); }}
                        className="btn-tint-success"
                      >
                        {t('incidents.resolve')}
                      </button>
                    )}

                    {incident.status === 'open' && (
                      <button
                        disabled={isUpdating}
                        onClick={e => { e.stopPropagation(); void updateStatus(incident.id, 'dismissed'); }}
                        className="btn-tint-neutral"
                      >
                        {t('incidents.dismiss')}
                      </button>
                    )}

                    {(isUpdating || isRemediating) && (
                      <span className="incident-saving">{t('incidents.saving')}</span>
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

/**
 * Página SchemaDiffs — Reportes de comparación de schemas
 *
 * Lista los reportes de diff de schemas para el tenant actual.
 * Los operadores pueden revisar los mappings sugeridos y enviar feedback
 * de aceptación/rechazo que retroalimenta la memoria de aprendizaje del schema-bridge.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';
import './SchemaViews.css';

const MOCK_REPORTS: DiffReport[] = import.meta.env.PROD && !import.meta.env.VITE_ENABLE_DEMO_FALLBACKS 
  ? []
  : [
  {
    id: 'rep_01J8K9L0M1N2P3Q4R5S6T7V8W9',
    tenant_id: 'ten_01',
    source_connector_id: 'shopify_primary',
    target_connector_id: 'odoo_erp',
    created_at: new Date().toISOString(),
    diff_payload: {
      summary: { coveragePercent: 85, breakingCount: 1, nonBreakingCount: 12 },
      mappings: [
        { pathA: 'id', pathB: 'external_id', confidence: 0.99 },
        { pathA: 'customer.email', pathB: 'partner.email', confidence: 0.98 },
        { pathA: 'customer.name.first', pathB: 'partner.given_name', confidence: 0.92 },
        { pathA: 'customer.name.last', pathB: 'partner.family_name', confidence: 0.92 },
        { pathA: 'order.items[*].id', pathB: 'items[*].product_id', confidence: 0.85 },
        { pathA: 'order.items[*].price', pathB: 'items[*].unit_price', confidence: 0.88 },
        { pathA: 'order.total', pathB: 'total_amount', confidence: 0.99 },
        { pathA: 'metadata.ip', pathB: '', confidence: 0.10 }
      ]
    }
  }
];

// ─── TreeNode Builder ─────────────────────────────────────────────────────────

interface TreeNodeData {
  name: string;
  fullPath: string;
  mapping?: FieldMapping;
  children: Record<string, TreeNodeData>;
}

function constructTree(mappings: FieldMapping[]): TreeNodeData {
  const root: TreeNodeData = { name: 'root', fullPath: '', children: {} };
  
  for (const mapping of mappings) {
    if (!mapping.pathA) continue; // safety check
    // Split on dots, while preserving array brackets like items[*]
    const parts = mapping.pathA.split('.').filter(Boolean);
    let current = root;
    let pathSoFar = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar = pathSoFar ? `${pathSoFar}.${part}` : part;
      
      if (!current.children[part]) {
        current.children[part] = { name: part, fullPath: pathSoFar, children: {} };
      }
      current = current.children[part];
      
      // If it's the leaf node of this mapping
      if (i === parts.length - 1) {
        current.mapping = mapping;
      }
    }
  }
  return root;
}

interface FieldMapping {
  pathA: string;
  pathB: string;
  confidence: number;
  transformType?: string;
}

interface DiffSummary {
  coveragePercent?: number;
  breakingCount?: number;
  nonBreakingCount?: number;
}

interface DiffReport {
  id: string;
  tenant_id: string;
  workflow_id?: string;
  source_connector_id?: string;
  target_connector_id?: string;
  diff_payload?: {
    summary?: DiffSummary;
    mappings?: FieldMapping[];
  };
  created_at?: string;
}

interface FeedbackPayload {
  sourcePath: string;
  targetPath: string;
  accepted: boolean;
  confidence: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchemaDiffs() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<DiffReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<DiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  // Guarda el id de la última llamada a loadReport para descartar respuestas fuera de orden.
  const currentReportRequestId = useRef<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminJson<{ success: boolean; data: DiffReport[] }>(
        '/api/schemas/reports'
      );
      setReports(result.data ?? []);
    } catch (err) {
      if (allowDemoFallbacks) {
        setReports(MOCK_REPORTS);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Error cargando reportes');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (id: string) => {
    currentReportRequestId.current = id;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminJson<{ success: boolean; data: DiffReport }>(
        `/api/schemas/reports/${id}`
      );
      if (currentReportRequestId.current !== id) return; // descartar respuesta obsoleta
      setSelectedReport(result.data);
      setFeedbackStatus({});
    } catch (err) {
      if (allowDemoFallbacks) {
        const mock = MOCK_REPORTS.find(r => r.id === id) || MOCK_REPORTS[0];
        setSelectedReport(mock);
        setFeedbackStatus({});
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Error cargando reporte');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const submitFeedback = useCallback(async (
    reportId: string,
    mapping: FieldMapping,
    accepted: boolean
  ) => {
    const key = `${mapping.pathA}\x00${mapping.pathB}`;
    setSubmitting(key);
    try {
      const body: FeedbackPayload = {
        sourcePath: mapping.pathA,
        targetPath: mapping.pathB,
        accepted,
        confidence: mapping.confidence,
      };
      await fetchAdminJson(`/api/schemas/reports/${reportId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setFeedbackStatus((prev: Record<string, 'accepted' | 'rejected'>) => ({ ...prev, [key]: accepted ? 'accepted' : 'rejected' }));
    } catch (err) {
      if (allowDemoFallbacks) {
        // En modo demo, simulamos éxito inmediato
        setFeedbackStatus((prev: Record<string, 'accepted' | 'rejected'>) => ({ ...prev, [key]: accepted ? 'accepted' : 'rejected' }));
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Error enviando feedback');
      }
    } finally {
      setSubmitting(null);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const mappings = selectedReport?.diff_payload?.mappings ?? [];
  const summary = selectedReport?.diff_payload?.summary;

  // Memoize tree calculation to prevent lag on huge datasets
  const treeRoot = useMemo(() => constructTree(mappings), [mappings]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('schemaDiffs.title')}</h1>
          <p className="page-subtitle">{t('schemaDiffs.subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <div className="split-layout">
        {/* Lista de reportes */}
        <div className="split-left">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Reportes</h2>
              <button className="btn btn-secondary btn-sm" onClick={loadReports} disabled={loading}>
                {t('common.retry')}
              </button>
            </div>
            {loading && !selectedReport && (
              <div className="loading-state">Cargando...</div>
            )}
            {reports.length === 0 && !loading && (
              <div className="empty-state">Sin reportes</div>
            )}
            <ul className="report-list">
              {reports.map((r: DiffReport) => (
                <li
                  key={r.id}
                  className={`report-item ${selectedReport?.id === r.id ? 'active' : ''}`}
                  onClick={() => loadReport(r.id)}
                >
                  <div className="report-item-id">{r.id}</div>
                  <div className="report-item-meta">
                    {r.source_connector_id && r.target_connector_id
                      ? `${r.source_connector_id} → ${r.target_connector_id}`
                      : 'Conectores no especificados'}
                  </div>
                  {r.created_at && (
                    <div className="report-item-date">
                      {new Date(r.created_at).toLocaleString('es-AR')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Detalle del reporte */}
        <div className="split-right">
          {!selectedReport && (
            <div className="card empty-state-card">
              <p>Selecciona un reporte para ver los mappings sugeridos</p>
            </div>
          )}
          {selectedReport && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Mappings — {selectedReport.id}</h2>
                {summary && (
                  <div className="summary-badges">
                    {summary.coveragePercent != null && (
                      <span className="badge badge-info">{summary.coveragePercent}% cobertura</span>
                    )}
                    {summary.breakingCount != null && summary.breakingCount > 0 && (
                      <span className="badge badge-error">{summary.breakingCount} breaking</span>
                    )}
                    {summary.nonBreakingCount != null && (
                      <span className="badge badge-success">{summary.nonBreakingCount} ok</span>
                    )}
                  </div>
                )}
              </div>

              {loading && <div className="loading-state">Cargando mappings...</div>}

              {mappings.length === 0 && !loading && (
                <div className="empty-state">Sin mappings en este reporte</div>
              )}

              <div className="json-tree-container">
                {(Object.values(treeRoot.children) as TreeNodeData[]).map((nodeData) => (
                  <TreeNodeView 
                    key={nodeData.fullPath}
                    node={nodeData}
                    level={0}
                    reportId={selectedReport.id}
                    feedbackStatus={feedbackStatus}
                    submitting={submitting}
                    submitFeedback={submitFeedback}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TreeNode Component ───────────────────────────────────────────────────────

interface TreeNodeViewProps {
  key?: string | number;
  node: TreeNodeData;
  level: number;
  reportId: string;
  feedbackStatus: Record<string, 'accepted' | 'rejected'>;
  submitting: string | null;
  submitFeedback: (rId: string, m: FieldMapping, a: boolean) => void;
}

function TreeNodeView({ node, level, reportId, feedbackStatus, submitting, submitFeedback }: TreeNodeViewProps) {
  const hasChildren = Object.keys(node.children).length > 0;
  // Default expanded si es root o tiene pocos niveles, sino colapsado para no saturar.
  const [expanded, setExpanded] = useState(level < 2);
  const m = node.mapping;

  const toggle = () => {
    if (hasChildren) setExpanded(!expanded);
  };

  const isObjectSignature = hasChildren || node.name.endsWith('[*]');
  
  return (
    <div className={`tree-node ${expanded ? 'expanded' : 'collapsed'}`}>
      <div 
        className={`tree-node-header ${hasChildren ? 'clickable' : ''}`}
        style={{ paddingLeft: `${level * 24}px` }}
        onClick={toggle}
      >
        <div className="tree-node-left">
          <span className={`tree-caret ${hasChildren ? '' : 'invisible'}`}>
            {expanded ? '▼' : '▶'}
          </span>
          <span className={`tree-node-name ${isObjectSignature ? 'is-object' : 'is-primitive'}`}>
            {node.name}
          </span>
        </div>
        
        {m && (
          <div className="tree-node-right">
            <MappingInline 
              mapping={m} 
              reportId={reportId}
              feedbackStatus={feedbackStatus}
              submitting={submitting}
              submitFeedback={submitFeedback}
            />
          </div>
        )}
      </div>

      {hasChildren && (
        <div className={`tree-children-wrapper ${expanded ? 'is-expanded' : ''}`}>
          <div className="tree-children-inner">
            {(Object.values(node.children) as TreeNodeData[]).map((child) => (
              <TreeNodeView 
                key={child.fullPath}
                node={child}
                level={level + 1}
                reportId={reportId}
                feedbackStatus={feedbackStatus}
                submitting={submitting}
                submitFeedback={submitFeedback}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MappingInline({ mapping, reportId, feedbackStatus, submitting, submitFeedback }: any) {
  const m = mapping;
  const key = `${m.pathA}\x00${m.pathB}`;
  const status = feedbackStatus[key];
  const isBusy = submitting === key;
  
  const confScore = Math.round(m.confidence * 100);
  const ringClass = confScore >= 90 ? 'ring-high' : confScore >= 70 ? 'ring-medium' : 'ring-low';

  return (
    <div className={`mapping-inline ${status ? `status-${status}` : ''}`}>
      <div className="mapping-target">
        ➔ <span className="target-code">{m.pathB}</span>
      </div>
      
      <div className={`confidence-mini-ring ${ringClass}`}>
        <svg viewBox="0 0 36 36" className="circular-chart-mini">
          <path className="circle-bg"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path className="circle"
            strokeDasharray={`${confScore}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className="confidence-text-mini">{confScore}%</span>
      </div>

      <div className="inline-feedback-actions">
        {status === 'accepted' && <div className="feedback-result success">✓</div>}
        {status === 'rejected' && <div className="feedback-result error">✕</div>}
        {!status && (
          <>
            <button
              className="btn btn-icon btn-accept"
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); submitFeedback(reportId, m, true); }}
              title="Aprobar Mapping"
            >
              {isBusy ? <span className="spinner"></span> : '✓'}
            </button>
            <button
              className="btn btn-icon btn-reject"
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); submitFeedback(reportId, m, false); }}
              title="Rechazar Mapping"
            >
              {isBusy ? <span className="spinner"></span> : '✕'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

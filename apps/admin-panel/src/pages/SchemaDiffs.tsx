/**
 * Página SchemaDiffs — Reportes de comparación de schemas
 *
 * Lista los reportes de diff de schemas para el tenant actual.
 * Los operadores pueden revisar los mappings sugeridos y enviar feedback
 * de aceptación/rechazo que retroalimenta la memoria de aprendizaje del schema-bridge.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';

// ─── Types ────────────────────────────────────────────────────────────────────

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
      setError(err instanceof Error ? err.message : 'Error cargando reportes');
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
      setError(err instanceof Error ? err.message : 'Error cargando reporte');
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
      setFeedbackStatus(prev => ({ ...prev, [key]: accepted ? 'accepted' : 'rejected' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error enviando feedback');
    } finally {
      setSubmitting(null);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const mappings = selectedReport?.diff_payload?.mappings ?? [];
  const summary = selectedReport?.diff_payload?.summary;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Schema Diffs</h1>
        <p className="page-subtitle">Reportes de comparación entre esquemas de conectores</p>
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
                Actualizar
              </button>
            </div>
            {loading && !selectedReport && (
              <div className="loading-state">Cargando...</div>
            )}
            {reports.length === 0 && !loading && (
              <div className="empty-state">Sin reportes</div>
            )}
            <ul className="report-list">
              {reports.map(r => (
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

              <div className="mapping-list">
                {mappings.map(m => {
                  const key = `${m.pathA}\x00${m.pathB}`;
                  const status = feedbackStatus[key];
                  const isBusy = submitting === key;

                  return (
                    <div key={key} className={`mapping-row ${status ? `mapping-${status}` : ''}`}>
                      <div className="mapping-paths">
                        <span className="mapping-path-a">{m.pathA}</span>
                        <span className="mapping-arrow">→</span>
                        <span className="mapping-path-b">{m.pathB}</span>
                      </div>
                      <div className="mapping-meta">
                        <span className="mapping-confidence">
                          {Math.round(m.confidence * 100)}%
                        </span>
                        {m.transformType && (
                          <span className="mapping-transform">{m.transformType}</span>
                        )}
                      </div>
                      <div className="mapping-actions">
                        {status === 'accepted' && <span className="badge badge-success">Aceptado</span>}
                        {status === 'rejected' && <span className="badge badge-error">Rechazado</span>}
                        {!status && (
                          <>
                            <button
                              className="btn btn-success btn-sm"
                              disabled={isBusy}
                              onClick={() => submitFeedback(selectedReport.id, m, true)}
                            >
                              {isBusy ? '...' : 'Aceptar'}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={isBusy}
                              onClick={() => submitFeedback(selectedReport.id, m, false)}
                            >
                              {isBusy ? '...' : 'Rechazar'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

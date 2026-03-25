/**
 * MappingMemory Page — Operator Mapping Memory Inspector
 *
 * Allows admins/operators to inspect the accumulated mapping memory for
 * any pair of connectors. Useful for debugging schema-bridge decisions
 * and auditing learned field mappings.
 */

import { useState, useCallback } from 'react';
import { fetchAdminJson } from '../lib/adminApi';
import './Pages.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MappingMemoryEntry {
  sourcePath: string;
  targetPath: string;
  connectorAId?: string;
  connectorBId?: string;
  acceptedCount: number;
  rejectedCount: number;
  averageConfidence: number;
  lastAcceptedAt?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MappingMemory() {
  const [connectorAId, setConnectorAId] = useState('');
  const [connectorBId, setConnectorBId] = useState('');
  const [entries, setEntries] = useState<MappingMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const loadMemory = useCallback(async () => {
    if (!connectorAId.trim() || !connectorBId.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ connectorAId, connectorBId });
      const result = await fetchAdminJson<{ success: boolean; data: MappingMemoryEntry[] }>(
        `/api/schemas/memory?${params}`
      );
      setEntries(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando memoria');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [connectorAId, connectorBId]);

  const confidenceColor = (c: number) => {
    if (c >= 0.90) return '#22c55e';
    if (c >= 0.75) return '#f59e0b';
    return '#ef4444';
  };

  const totalFeedback = (e: MappingMemoryEntry) => e.acceptedCount + e.rejectedCount;
  const acceptRatio = (e: MappingMemoryEntry) => {
    const total = totalFeedback(e);
    return total > 0 ? Math.round((e.acceptedCount / total) * 100) : null;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Mapping Memory</h1>
        <p className="page-subtitle">
          Memoria acumulada de decisiones de operadores para pares de conectores
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Buscar por par de conectores</h2>
        </div>
        <div className="filter-row">
          <div className="form-group">
            <label className="form-label">Conector A (fuente)</label>
            <input
              className="form-input"
              type="text"
              placeholder="ej: mercadopago"
              value={connectorAId}
              onChange={e => setConnectorAId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadMemory()}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Conector B (destino)</label>
            <input
              className="form-input"
              type="text"
              placeholder="ej: contabilium"
              value={connectorBId}
              onChange={e => setConnectorBId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadMemory()}
            />
          </div>
          <div className="form-group form-group-action">
            <button
              className="btn btn-primary"
              onClick={loadMemory}
              disabled={loading || !connectorAId.trim() || !connectorBId.trim()}
            >
              {loading ? 'Cargando...' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>

      {searched && !loading && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {entries.length} entrada{entries.length !== 1 ? 's' : ''} encontrada{entries.length !== 1 ? 's' : ''}
            </h2>
          </div>

          {entries.length === 0 && (
            <div className="empty-state">
              Sin entradas para este par de conectores. Los operadores aún no registraron feedback.
            </div>
          )}

          {entries.length > 0 && (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campo fuente</th>
                    <th>Campo destino</th>
                    <th>Confianza avg</th>
                    <th>Aceptados</th>
                    <th>Rechazados</th>
                    <th>Ratio accept</th>
                    <th>Último aceptado</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const ratio = acceptRatio(e);
                    return (
                      <tr key={`${e.sourcePath}→${e.targetPath}`}>
                        <td className="mono">{e.sourcePath}</td>
                        <td className="mono">{e.targetPath}</td>
                        <td>
                          <span
                            className="confidence-badge"
                            style={{ color: confidenceColor(e.averageConfidence) }}
                          >
                            {Math.round(e.averageConfidence * 100)}%
                          </span>
                        </td>
                        <td>{e.acceptedCount}</td>
                        <td>{e.rejectedCount}</td>
                        <td>
                          {ratio !== null
                            ? <span className={`badge ${ratio >= 70 ? 'badge-success' : 'badge-error'}`}>{ratio}%</span>
                            : '—'}
                        </td>
                        <td>
                          {e.lastAcceptedAt
                            ? new Date(e.lastAcceptedAt).toLocaleString('es-AR')
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

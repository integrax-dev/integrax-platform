/**
 * InMemoryTimelineStore
 *
 * Implementacion de referencia de TimelineStore.
 * Las entradas se agregan en orden cronologico y se consultan con un motor
 * simple de filtros. Sirve para tests y desarrollo en un solo proceso.
 *
 * En produccion se reemplaza por una implementacion sobre base de datos
 * (Postgres, ClickHouse, etc.).
 */

import type {
  TimelineEntry,
  TimelineEntryInput,
  TimelineFilter,
  TimelineStore,
  ConflictTrace,
} from './types.js';
import { ulid } from './ulid.js';

export class InMemoryTimelineStore implements TimelineStore {
  /** tenantId -> entradas en orden de insercion (ulid mantiene el orden temporal) */
  private readonly store = new Map<string, TimelineEntry[]>();

  private bucket(tenantId: string): TimelineEntry[] {
    let entries = this.store.get(tenantId);
    if (!entries) {
      entries = [];
      this.store.set(tenantId, entries);
    }
    return entries;
  }

  async append(
    tenantId: string,
    entry: TimelineEntryInput,
  ): Promise<TimelineEntry> {
    const full: TimelineEntry = {
      ...entry,
      id: ulid(),
      recordedAt: new Date(),
    } as TimelineEntry;
    this.bucket(tenantId).push(full);
    return full;
  }

  async list(tenantId: string, filter: TimelineFilter = {}): Promise<TimelineEntry[]> {
    let entries = [...(this.store.get(tenantId) ?? [])];

    // Filtro por kind.
    if (filter.kind !== undefined) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
      entries = entries.filter(e => kinds.includes(e.kind));
    }

    // Filtro por entityType.
    if (filter.entityType !== undefined) {
      const et = filter.entityType;
      entries = entries.filter(e => {
        const typed = e as unknown as Record<string, unknown>;
        return typed['entityType'] === et;
      });
    }

    // Filtro por canonicalId.
    if (filter.canonicalId !== undefined) {
      const cid = filter.canonicalId;
      entries = entries.filter(e => {
        const typed = e as unknown as Record<string, unknown>;
        return typed['canonicalId'] === cid;
      });
    }

    // Filtro por sourceSystem.
    if (filter.sourceSystem !== undefined) {
      const ss = filter.sourceSystem;
      entries = entries.filter(e => {
        const typed = e as unknown as Record<string, unknown>;
        return typed['sourceSystem'] === ss;
      });
    }

    // Filtro por severidad.
    if (filter.severity && filter.severity.length > 0) {
      const sev = filter.severity;
      entries = entries.filter(e => {
        const typed = e as unknown as Record<string, unknown>;
        return sev.includes(typed['severity'] as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL');
      });
    }

    // Rango temporal.
    if (filter.from !== undefined) {
      const from = filter.from;
      entries = entries.filter(e => e.occurredAt >= from);
    }
    if (filter.to !== undefined) {
      const to = filter.to;
      entries = entries.filter(e => e.occurredAt <= to);
    }

    // Paginacion por cursor.
    if (filter.after !== undefined) {
      const afterId = filter.after;
      const idx = entries.findIndex(e => e.id === afterId);
      entries = idx >= 0 ? entries.slice(idx + 1) : entries;
    }

    // Limite.
    if (filter.limit !== undefined && filter.limit > 0) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  async get(tenantId: string, id: string): Promise<TimelineEntry | null> {
    return this.store.get(tenantId)?.find(e => e.id === id) ?? null;
  }

  async resolveConflict(
    tenantId: string,
    id: string,
    resolution: Pick<ConflictTrace, 'status' | 'resolvedAt' | 'resolvedBy' | 'resolution'>,
  ): Promise<ConflictTrace> {
    const entries = this.bucket(tenantId);
    const idx = entries.findIndex(e => e.id === id);
    if (idx < 0) {
      throw new Error(`Timeline: no se encontro la entrada de conflicto '${id}' para el tenant '${tenantId}'`);
    }
    const entry = entries[idx];
    if (entry.kind !== 'conflict') {
      throw new Error(`Timeline: la entrada '${id}' es de tipo '${entry.kind}' y se esperaba 'conflict'`);
    }
    const updated: ConflictTrace = { ...(entry as ConflictTrace), ...resolution };
    entries[idx] = updated;
    return updated;
  }
}

import type { TimelineStore, TimelineEntry, EntityTrace, TimelineKind } from '@integrax/timeline';
import type {
  AdminTimelineEntry,
  SafeEntityTrace,
  AdminTimelineFilter,
  TimelineSummary,
  TimelineKindCount,
} from './types.js';

interface SqlCountableStore {
  countByKind(tenantId: string, from: Date, to: Date): Promise<Array<{ kind: string; count: number; latest: Date | null }>>;
  platformCountByKind(tenantIds: string[], from: Date, to: Date): Promise<{ total: number; byKind: Record<string, number> }>;
}

function isSqlCountable(store: TimelineStore): store is TimelineStore & SqlCountableStore {
  return typeof (store as unknown as SqlCountableStore).countByKind === 'function';
}

function stripDeltas(entry: EntityTrace): SafeEntityTrace {
  const { deltas, ...rest } = entry;
  return { ...rest, deltaCount: deltas.length };
}

function makeSafe(entry: TimelineEntry): AdminTimelineEntry {
  if (entry.kind === 'entity') return stripDeltas(entry as EntityTrace);
  return entry as AdminTimelineEntry;
}

const ALL_KINDS: TimelineKind[] = [
  'entity', 'sync', 'conflict', 'workflow', 'schema_drift', 'policy_decision',
];

/**
 * ConsistencyTimelineService — admin-safe aggregation layer over TimelineStore.
 *
 * Guarantees:
 *   - EntityTrace.deltas are never exposed; replaced by deltaCount (structural count)
 *   - All other entries pass through as-is (they carry no field values)
 *   - summarize() returns only counts + timestamps, never entry content
 */
export class ConsistencyTimelineService {
  constructor(private readonly store: TimelineStore) {}

  /** List timeline entries for a tenant, stripping all field values. */
  async listAdminSafe(
    tenantId: string,
    filter: AdminTimelineFilter = {},
  ): Promise<AdminTimelineEntry[]> {
    const entries = await this.store.list(tenantId, filter);
    return entries.map(makeSafe);
  }

  /** Return count + latest timestamp per kind for a time window. */
  async summarize(
    tenantId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<TimelineSummary> {
    const from = opts.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = opts.to ?? new Date();

    if (isSqlCountable(this.store)) {
      const rows = await this.store.countByKind(tenantId, from, to);
      const index = new Map(rows.map(r => [r.kind, r]));
      const kindCounts: TimelineKindCount[] = ALL_KINDS.map(kind => ({
        kind,
        count: index.get(kind)?.count ?? 0,
        latest: index.get(kind)?.latest ?? null,
      }));
      const total = kindCounts.reduce((s, k) => s + k.count, 0);
      return { tenantId, from, to, total, byKind: kindCounts };
    }

    const entries = await this.store.list(tenantId, { from, to, limit: 2_000 });
    const byKind = new Map<TimelineKind, { count: number; latest: Date | null }>();
    for (const kind of ALL_KINDS) byKind.set(kind, { count: 0, latest: null });
    for (const e of entries) {
      const slot = byKind.get(e.kind);
      if (!slot) continue;
      slot.count++;
      if (!slot.latest || e.occurredAt > slot.latest) slot.latest = e.occurredAt;
    }
    const kindCounts: TimelineKindCount[] = ALL_KINDS.map(kind => ({
      kind,
      count: byKind.get(kind)!.count,
      latest: byKind.get(kind)!.latest,
    }));
    return { tenantId, from, to, total: entries.length, byKind: kindCounts };
  }

  /** Return the single most-recent entry per kind. */
  async latestPerKind(tenantId: string): Promise<Partial<Record<TimelineKind, AdminTimelineEntry>>> {
    const result: Partial<Record<TimelineKind, AdminTimelineEntry>> = {};
    await Promise.all(
      ALL_KINDS.map(async kind => {
        const entries = await this.store.list(tenantId, { kind, limit: 1 });
        if (entries.length) result[kind] = makeSafe(entries[entries.length - 1]);
      }),
    );
    return result;
  }

  /** Count entries per kind across all provided tenantIds (for platform dashboard). */
  async platformSummary(
    tenantIds: string[],
    opts: { from?: Date; to?: Date } = {},
  ): Promise<{ total: number; byKind: Record<TimelineKind, number> }> {
    const from = opts.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = opts.to ?? new Date();

    if (isSqlCountable(this.store)) {
      const result = await this.store.platformCountByKind(tenantIds, from, to);
      const byKind = Object.fromEntries(ALL_KINDS.map(k => [k, result.byKind[k] ?? 0])) as Record<TimelineKind, number>;
      return { total: result.total, byKind };
    }

    const aggregated: Record<string, number> = {};
    for (const kind of ALL_KINDS) aggregated[kind] = 0;
    let total = 0;
    await Promise.all(
      tenantIds.map(async tenantId => {
        const summary = await this.summarize(tenantId, opts);
        total += summary.total;
        for (const slot of summary.byKind) {
          aggregated[slot.kind] = (aggregated[slot.kind] ?? 0) + slot.count;
        }
      }),
    );
    return { total, byKind: aggregated as Record<TimelineKind, number> };
  }
}

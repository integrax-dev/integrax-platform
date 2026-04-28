import type {
  MappingRecord,
  MappingLifecycleState,
  TransitionEvent,
} from './types.js';

export class GovernanceViolationError extends Error {
  constructor(
    message: string,
    public readonly mappingId: string,
    public readonly fromState: MappingLifecycleState,
    public readonly attemptedTransition: string,
  ) {
    super(message);
    this.name = 'GovernanceViolationError';
  }
}

const ALLOWED: Partial<Record<MappingLifecycleState, Set<MappingLifecycleState>>> = {
  candidate:    new Set(['validated', 'deprecated']),
  validated:    new Set(['trusted', 'deprecated']),
  trusted:      new Set(['ground_truth', 'deprecated']),
  ground_truth: new Set(['deprecated']),
  deprecated:   new Set(),
};

export class MappingGovernanceEngine {
  private readonly records = new Map<string, MappingRecord>();

  register(record: MappingRecord): void {
    this.records.set(record.id, { ...record });
  }

  get(id: string): MappingRecord | undefined {
    const r = this.records.get(id);
    return r ? { ...r } : undefined;
  }

  list(opts?: { tenantId?: string; connectorAId?: string; connectorBId?: string; state?: MappingLifecycleState }): MappingRecord[] {
    return [...this.records.values()]
      .filter(r => !opts?.tenantId || r.tenantId === opts.tenantId)
      .filter(r => !opts?.state || r.state === opts.state)
      .filter(r => {
        if (!opts?.connectorAId && !opts?.connectorBId) return true;
        const pair = new Set([r.connectorAId, r.connectorBId]);
        if (opts.connectorAId && !pair.has(opts.connectorAId)) return false;
        if (opts.connectorBId && !pair.has(opts.connectorBId)) return false;
        return true;
      })
      .map(r => ({ ...r }));
  }

  /**
   * Advances a mapping to its next lifecycle state.
   *
   * INVARIANT enforced here:
   *   - 'candidate' can never skip to 'trusted' or 'ground_truth' directly.
   *   - 'ground_truth' can ONLY be reached via TransitionEvent{ kind: 'promote_ground_truth' }
   *     which structurally requires approvedBy.
   *   - Auto-promotion from trusted → ground_truth without explicit event throws GovernanceViolationError.
   */
  transition(id: string, event: TransitionEvent): MappingRecord {
    const record = this.records.get(id);
    if (!record) throw new GovernanceViolationError(`Mapping '${id}' not found`, id, 'candidate', event.kind);

    const target = this.eventToState(event);
    const allowed = ALLOWED[record.state];

    if (!allowed || !allowed.has(target)) {
      throw new GovernanceViolationError(
        `Cannot transition mapping '${id}' from '${record.state}' to '${target}'. Transition '${event.kind}' is not allowed from this state.`,
        id,
        record.state,
        event.kind,
      );
    }

    // ground_truth requires explicit approvedBy from the event
    if (target === 'ground_truth') {
      if (event.kind !== 'promote_ground_truth') {
        throw new GovernanceViolationError(
          `Mapping '${id}' cannot be promoted to ground_truth without explicit promote_ground_truth event`,
          id,
          record.state,
          event.kind,
        );
      }
      record.approvedBy = event.approvedBy;
    }

    record.state = target;
    record.updatedAt = new Date();
    return { ...record };
  }

  recordFeedback(id: string, outcome: 'accepted' | 'rejected' | 'corrected'): MappingRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;

    if (outcome === 'accepted') record.acceptedCount++;
    else if (outcome === 'rejected') record.rejectedCount++;
    else record.correctionCount++;
    record.updatedAt = new Date();

    // Auto-promote candidate → validated after sufficient acceptance signal
    if (record.state === 'candidate' && record.acceptedCount >= 5 && record.rejectedCount === 0) {
      record.state = 'validated';
    }
    // Auto-promote validated → trusted after strong signal (NOT to ground_truth)
    if (record.state === 'validated' && record.acceptedCount >= 20 && record.rejectedCount === 0) {
      record.state = 'trusted';
    }

    return { ...record };
  }

  private eventToState(event: TransitionEvent): MappingLifecycleState {
    switch (event.kind) {
      case 'validate':              return 'validated';
      case 'trust':                 return 'trusted';
      case 'promote_ground_truth':  return 'ground_truth';
      case 'deprecate':             return 'deprecated';
    }
  }
}

import type { AuthorityRule, AuthorityResolution, AuthorityMode } from './types.js';

const DEFAULT_RESOLUTION: AuthorityResolution = {
  mode: 'observe_only',
  rule: null,
  source: 'default',
};

/** Modes that mutate data and therefore require explicit human approval on the rule. */
const EXECUTION_MODES = new Set<AuthorityMode>([
  'auto_accept', 'prefer_a', 'prefer_b', 'latest_wins', 'highest_value',
]);

/**
 * Gate execution modes behind approvedBy.
 * A rule with mode='prefer_a' but no approvedBy resolves to 'recommend_only' instead.
 * This makes it structurally impossible to auto-execute without explicit sign-off.
 */
function safeMode(rule: AuthorityRule): AuthorityMode {
  if (EXECUTION_MODES.has(rule.mode) && !rule.approvedBy) return 'recommend_only';
  return rule.mode;
}

/**
 * Resolves which authority mode applies to a given (tenant, entityType, field, connectorPair).
 *
 * Resolution order (most-specific first):
 *   tenant + entityType + field + connectorPair
 *   tenant + entityType + field
 *   tenant + entityType
 *   tenant (all fields)
 *   platform default (tenantId undefined)
 *
 * INVARIANT: when no rule matches, the registry ALWAYS returns observe_only.
 * There are no implicit platform-wide overrides.
 */
export class AuthorityRegistry {
  private readonly rules: AuthorityRule[] = [];

  register(rule: AuthorityRule): void {
    this.rules.push(rule);
  }

  registerAll(rules: AuthorityRule[]): void {
    for (const r of rules) this.register(r);
  }

  remove(id: string): void {
    const idx = this.rules.findIndex(r => r.id === id);
    if (idx !== -1) this.rules.splice(idx, 1);
  }

  resolve(opts: {
    tenantId: string;
    entityType?: string;
    field?: string;
    connectorA?: string;
    connectorB?: string;
  }): AuthorityResolution {
    const enabled = this.rules.filter(r => r.enabled);

    const score = (r: AuthorityRule): number => {
      let s = 0;
      if (r.tenantId === opts.tenantId) s += 8;
      else if (r.tenantId !== undefined) return -1; // different tenant → skip
      if (r.entityType !== undefined && r.entityType === opts.entityType) s += 4;
      else if (r.entityType !== undefined) return -1;
      if (r.field !== undefined && r.field === opts.field) s += 2;
      else if (r.field !== undefined) return -1;
      if (r.connectorPair !== undefined) {
        const [ca, cb] = r.connectorPair;
        const matches =
          (ca === opts.connectorA && cb === opts.connectorB) ||
          (ca === opts.connectorB && cb === opts.connectorA);
        if (matches) s += 1;
        else return -1;
      }
      return s;
    };

    let best: AuthorityRule | null = null;
    let bestScore = -1;

    for (const r of enabled) {
      const s = score(r);
      if (s > bestScore || (s === bestScore && best !== null && r.priority > best.priority)) {
        best = r;
        bestScore = s;
      }
    }

    if (!best) return DEFAULT_RESOLUTION;

    return {
      mode: safeMode(best),
      authorityConnector: best.authorityConnector,
      rule: best,
      source: 'explicit_rule',
    };
  }
}

import type { TolerancePolicy, ToleranceLookupKey, ToleranceEvaluationResult } from './types.js';
import { evaluateTolerance } from './evaluator.js';

/**
 * Hierarchical in-memory registry.
 *
 * Resolution order (most-specific first):
 *   1. tenant + entityType + field + connectorPair + country + currency
 *   2. tenant + entityType + field + connectorPair
 *   3. tenant + entityType + field
 *   4. tenant + entityType
 *   5. tenant (all fields)
 *   6. platform default (tenantId undefined)
 *
 * country and currency add 1 point each when matched (narrowing within a level).
 * Within the same specificity level, highest priority wins.
 */
export class ToleranceRegistry {
  private readonly policies: TolerancePolicy[] = [];

  register(policy: TolerancePolicy): void {
    this.policies.push(policy);
  }

  registerAll(policies: TolerancePolicy[]): void {
    for (const p of policies) this.register(p);
  }

  remove(id: string): void {
    const idx = this.policies.findIndex(p => p.id === id);
    if (idx !== -1) this.policies.splice(idx, 1);
  }

  resolve(key: ToleranceLookupKey): TolerancePolicy | null {
    const enabled = this.policies.filter(p => p.enabled);

    const score = (p: TolerancePolicy): number => {
      let s = 0;
      if (p.tenantId === key.tenantId) s += 8;
      else if (p.tenantId !== undefined) return -1; // different tenant → skip
      if (p.entityType !== undefined && p.entityType === key.entityType) s += 4;
      else if (p.entityType !== undefined) return -1;
      if (p.field !== undefined && p.field === key.field) s += 2;
      else if (p.field !== undefined) return -1;
      if (p.connectorPair !== undefined) {
        const [ca, cb] = p.connectorPair;
        const matches =
          (ca === key.connectorA && cb === key.connectorB) ||
          (ca === key.connectorB && cb === key.connectorA);
        if (matches) s += 1;
        else return -1;
      }
      // country/currency narrow within a specificity level (+1 each when matched)
      if (p.country !== undefined && p.country === key.country) s += 1;
      else if (p.country !== undefined && p.country !== key.country) return -1;
      if (p.currency !== undefined && p.currency === key.currency) s += 1;
      else if (p.currency !== undefined && p.currency !== key.currency) return -1;
      return s;
    };

    let best: TolerancePolicy | null = null;
    let bestScore = -1;

    for (const p of enabled) {
      const s = score(p);
      if (s > bestScore || (s === bestScore && best !== null && p.priority > best.priority)) {
        best = p;
        bestScore = s;
      }
    }

    return best;
  }

  evaluate(key: ToleranceLookupKey, a: unknown, b: unknown): ToleranceEvaluationResult {
    const policy = this.resolve(key);
    return evaluateTolerance(a, b, policy);
  }
}

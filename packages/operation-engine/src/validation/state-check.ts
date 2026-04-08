/**
 * State Check
 *
 * Verifies that the target entity is in a state that permits the requested command.
 * E.g. a cancelled order cannot be updated; a CAE-authorized invoice cannot be voided.
 *
 * State rules are pluggable: register StateRule entries per (entityType, commandName).
 * The default implementation reads the snapshot store.
 */

import type { SnapshotStore } from '@integrax/snapshot-store';
import type { OperationTarget } from '../core/target.js';
import { makeError, type OperationError } from '../core/operation-error.js';

export interface StateRule {
  entityType: string;
  commandName: string;
  /**
   * Returns null if the state is acceptable, or an error message if not.
   * Receives the entity's current snapshot payload.
   */
  check: (payload: Record<string, unknown>) => string | null;
}

export interface StateCheckParams {
  tenantId: string;
  target: OperationTarget;
  commandName: string;
  snapshotStore: SnapshotStore;
  rules?: StateRule[];
}

export interface StateCheckResult {
  allowed: boolean;
  error?: OperationError;
}

export async function checkState(params: StateCheckParams): Promise<StateCheckResult> {
  const { tenantId, target, commandName, snapshotStore, rules = [] } = params;

  // If no canonicalId provided, nothing to check
  if (!target.canonicalId || !target.entityType) return { allowed: true };

  const matchingRules = rules.filter(
    r => r.entityType === target.entityType && r.commandName === commandName,
  );

  if (matchingRules.length === 0) return { allowed: true };

  const snapshot = await snapshotStore.get(tenantId, target.entityType, target.canonicalId);
  if (!snapshot) {
    // Entity doesn't exist yet — some commands require it to exist
    const requiresExisting = ['update_record', 'delete_record', 'archive_record', 'publish_record'];
    if (requiresExisting.some(cmd => commandName.includes(cmd.replace('_record', '')))) {
      return {
        allowed: false,
        error: makeError(
          'TARGET_NOT_FOUND',
          `Entity '${target.entityType}' with canonicalId '${target.canonicalId}' not found`,
          'state',
        ),
      };
    }
    return { allowed: true };
  }

  for (const rule of matchingRules) {
    const violation = rule.check(snapshot.payload);
    if (violation) {
      return {
        allowed: false,
        error: makeError(
          'STATE_CONFLICT',
          violation,
          'state',
        ),
      };
    }
  }

  return { allowed: true };
}

/**
 * Validator
 *
 * Orchestrates all validation steps in order:
 * 1. Preflight (required fields, target, payload schema)
 * 2. Permission check (actor × capability)
 * 3. Capability check (target system supports capability)
 * 4. State check (entity is in a state that permits the command)
 *
 * Returns on the first failing step — does not accumulate errors across phases.
 */

import type { OperationRequest } from '../core/operation.js';
import type { CapabilityMap } from '../core/capability.js';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { inferCapability } from '../core/capability.js';
import { runPreflight, type PayloadSchema } from './preflight.js';
import { checkPermission, type PermissionPolicy } from './permission-check.js';
import { checkCapability } from './capability-check.js';
import { checkState, type StateRule } from './state-check.js';
import type { OperationError } from '../core/operation-error.js';
import type { CommandDefinition } from '../core/command.js';

export interface ValidatorConfig {
  capabilityMap: CapabilityMap;
  snapshotStore: SnapshotStore;
  payloadSchemas?: PayloadSchema[];
  stateRules?: StateRule[];
  permissionPolicies?: Record<string, PermissionPolicy>; // keyed by tenantId
}

export interface ValidationResult {
  valid: boolean;
  errors: OperationError[];
}

export class Validator {
  constructor(private readonly config: ValidatorConfig) {}

  async validate(
    request: OperationRequest,
    commandDef?: CommandDefinition,
  ): Promise<ValidationResult> {
    // 1. Preflight
    const preflight = runPreflight({
      request,
      payloadSchemas: this.config.payloadSchemas,
    });
    if (!preflight.valid) return preflight;

    const capability = commandDef?.capability ?? inferCapability(request.commandName);
    const policy = this.config.permissionPolicies?.[request.tenantId];

    // 2. Permission
    const perm = checkPermission({
      actor: request.actor,
      capability,
      commandName: request.commandName,
      policy,
    });
    if (!perm.allowed) return { valid: false, errors: [perm.error!] };

    // 3. Capability (only if a target system is identified)
    const targetId = request.target?.connectorId ?? request.target?.systemId;
    if (targetId) {
      const cap = checkCapability({
        targetId,
        capability,
        commandName: request.commandName,
        capabilityMap: this.config.capabilityMap,
      });
      if (!cap.supported) return { valid: false, errors: [cap.error!] };
    }

    // 4. State
    const state = await checkState({
      tenantId: request.tenantId,
      target: request.target,
      commandName: request.commandName,
      snapshotStore: this.config.snapshotStore,
      rules: this.config.stateRules,
    });
    if (!state.allowed) return { valid: false, errors: [state.error!] };

    return { valid: true, errors: [] };
  }
}

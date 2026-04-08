/**
 * Approval Policy
 *
 * Determines whether an operation requires approval before execution.
 * Policies are registered per tenant and per command; the most specific wins.
 *
 * Default rules:
 * - delete_record: always requires approval
 * - approve_document: always requires approval
 * - system/workflow actors: never require approval
 * - Everything else: no approval required by default
 */

import type { OperationRequest } from '../core/operation.js';
import type { CommandDefinition } from '../core/command.js';
import type { OperationCapability } from '../core/capability.js';

export interface ApprovalPolicyRule {
  commandName?: string;
  capability?: OperationCapability;
  /** If true, this command always needs approval for this tenant. */
  requiresApproval: boolean;
  reason?: string;
}

export type TenantApprovalPolicies = Record<string, ApprovalPolicyRule[]>;

export interface ApprovalEvaluation {
  required: boolean;
  reason?: string;
}

const ALWAYS_APPROVE: OperationCapability[] = ['delete_record', 'approve_document'];

export class ApprovalPolicy {
  constructor(
    private readonly tenantPolicies: TenantApprovalPolicies = {},
  ) {}

  evaluate(
    request: OperationRequest,
    commandDef?: CommandDefinition,
  ): ApprovalEvaluation {
    // System/workflow actors bypass approval
    if (request.actor.type === 'system' || request.actor.type === 'workflow') {
      return { required: false };
    }

    // Command-level override
    if (commandDef?.requiresApproval) {
      return { required: true, reason: `Command '${request.commandName}' always requires approval` };
    }

    // Check tenant policies (most specific first: commandName match > capability match)
    const rules = this.tenantPolicies[request.tenantId] ?? [];
    const cmdRule = rules.find(r => r.commandName === request.commandName);
    if (cmdRule) {
      return { required: cmdRule.requiresApproval, reason: cmdRule.reason };
    }

    const cap = commandDef?.capability;
    if (cap) {
      const capRule = rules.find(r => r.capability === cap);
      if (capRule) {
        return { required: capRule.requiresApproval, reason: capRule.reason };
      }

      if (ALWAYS_APPROVE.includes(cap)) {
        return {
          required: true,
          reason: `Capability '${cap}' requires approval by default`,
        };
      }
    }

    return { required: false };
  }
}

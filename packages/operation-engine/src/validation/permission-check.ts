/**
 * Permission Check
 *
 * Verifies that the actor has the right to execute the command.
 * Pluggable: replace with a real RBAC/ABAC system for production.
 *
 * Default rules (can be overridden per-tenant via PermissionPolicy):
 * - 'system', 'workflow' actors: may execute any command
 * - 'api' actors with role 'platform_admin': any command
 * - 'api'/'user' actors with role 'tenant_admin': any command within their tenant
 * - 'api'/'user' with role 'operator': all except delete_record, approve_document
 * - 'api'/'user' with role 'viewer': read-only commands only (sync_record)
 */

import type { OperationActor } from '../core/actor.js';
import type { OperationCapability } from '../core/capability.js';
import { makeError, type OperationError } from '../core/operation-error.js';

const READ_ONLY_CAPABILITIES = new Set<OperationCapability>(['sync_record']);
const RESTRICTED_CAPABILITIES = new Set<OperationCapability>([
  'delete_record',
  'approve_document',
]);

export interface PermissionPolicy {
  /** Additional allowed capabilities beyond the defaults. */
  allow?: OperationCapability[];
  /** Capabilities explicitly blocked for this tenant. */
  deny?: OperationCapability[];
}

export interface PermissionCheckParams {
  actor: OperationActor;
  capability: OperationCapability;
  commandName: string;
  policy?: PermissionPolicy;
}

export interface PermissionCheckResult {
  allowed: boolean;
  error?: OperationError;
}

export function checkPermission(params: PermissionCheckParams): PermissionCheckResult {
  const { actor, capability, commandName, policy } = params;

  // Tenant-level deny list takes priority
  if (policy?.deny?.includes(capability)) {
    return {
      allowed: false,
      error: makeError(
        'PERMISSION_DENIED',
        `Command '${commandName}' (${capability}) is denied by tenant policy`,
        'permission',
      ),
    };
  }

  // System and workflow actors bypass role checks
  if (actor.type === 'system' || actor.type === 'workflow' || actor.type === 'module') {
    return { allowed: true };
  }

  const role = actor.role ?? 'viewer';

  if (role === 'platform_admin' || role === 'tenant_admin') {
    return { allowed: true };
  }

  if (role === 'operator') {
    if (RESTRICTED_CAPABILITIES.has(capability) && !policy?.allow?.includes(capability)) {
      return {
        allowed: false,
        error: makeError(
          'PERMISSION_DENIED',
          `Role 'operator' cannot execute '${commandName}' (${capability})`,
          'permission',
        ),
      };
    }
    return { allowed: true };
  }

  // viewer — read-only only
  if (!READ_ONLY_CAPABILITIES.has(capability)) {
    return {
      allowed: false,
      error: makeError(
        'PERMISSION_DENIED',
        `Role 'viewer' cannot execute '${commandName}' (${capability})`,
        'permission',
      ),
    };
  }

  return { allowed: true };
}

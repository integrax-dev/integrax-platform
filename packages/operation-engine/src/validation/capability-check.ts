/**
 * Capability Check
 *
 * Verifies that the target connector or system supports the requested capability.
 * Reads from a CapabilityMap registered at startup.
 */

import type { OperationCapability, CapabilityMap } from '../core/capability.js';
import { makeError, type OperationError } from '../core/operation-error.js';

export interface CapabilityCheckParams {
  /** connectorId or systemId from OperationTarget */
  targetId: string;
  capability: OperationCapability;
  commandName: string;
  capabilityMap: CapabilityMap;
}

export interface CapabilityCheckResult {
  supported: boolean;
  error?: OperationError;
}

export function checkCapability(params: CapabilityCheckParams): CapabilityCheckResult {
  const { targetId, capability, commandName, capabilityMap } = params;

  const supported = capabilityMap[targetId];
  if (!supported) {
    return {
      supported: false,
      error: makeError(
        'TARGET_NOT_FOUND',
        `No capability registration found for target '${targetId}'`,
        'capability',
      ),
    };
  }

  // 'custom' is always considered supported — the command itself is the specification
  if (capability === 'custom') return { supported: true };

  if (!supported.includes(capability)) {
    return {
      supported: false,
      error: makeError(
        'CAPABILITY_NOT_SUPPORTED',
        `Target '${targetId}' does not support capability '${capability}' required by '${commandName}'`,
        'capability',
      ),
    };
  }

  return { supported: true };
}

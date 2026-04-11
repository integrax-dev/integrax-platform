/**
 * Preflight Validation
 *
 * Runs lightweight checks before execution:
 * 1. Required fields in OperationRequest
 * 2. Target resolution (at least connectorId or systemId must be set for external ops)
 * 3. Payload schema validation (per-command schema registry)
 *
 * This runs after permission/capability checks and before planning.
 */

import type { OperationRequest } from '../core/operation.js';
import { makeError, type OperationError } from '../core/operation-error.js';

export interface PayloadSchema {
  commandName: string;
  /**
   * Validation function. Returns null if valid, or a human-readable message.
   * Use Zod, Joi, or manual checks inside.
   */
  validate: (payload: unknown) => string | null;
}

export interface PreflightParams {
  request: OperationRequest;
  payloadSchemas?: PayloadSchema[];
}

export interface PreflightResult {
  valid: boolean;
  errors: OperationError[];
}

export function runPreflight(params: PreflightParams): PreflightResult {
  const { request, payloadSchemas = [] } = params;
  const errors: OperationError[] = [];

  // 1. Required top-level fields
  if (!request.operationId) {
    errors.push(makeError('VALIDATION_FAILED', 'operationId is required', 'validation'));
  }
  if (!request.commandName) {
    errors.push(makeError('VALIDATION_FAILED', 'commandName is required', 'validation'));
  }
  if (!request.tenantId) {
    errors.push(makeError('VALIDATION_FAILED', 'tenantId is required', 'validation'));
  }
  if (!request.actor?.type) {
    errors.push(makeError('VALIDATION_FAILED', 'actor.type is required', 'validation'));
  }
  if (!request.requestedAt) {
    errors.push(makeError('VALIDATION_FAILED', 'requestedAt is required', 'validation'));
  }

  // 2. Target must have at least one resolution hint for external ops
  const { target } = request;
  if (target && !target.connectorId && !target.systemId && !target.resource) {
    // Pure internal ops without any target are allowed (e.g. resolve_conflict with canonicalId)
    if (!target.canonicalId && !target.entityType) {
      errors.push(makeError(
        'VALIDATION_FAILED',
        'target must specify at least one of: connectorId, systemId, canonicalId, entityType, resource',
        'validation',
      ));
    }
  }

  // 3. Per-command payload schema
  const schema = payloadSchemas.find(s => s.commandName === request.commandName);
  if (schema && request.payload !== undefined) {
    const violation = schema.validate(request.payload);
    if (violation) {
      errors.push(makeError('VALIDATION_FAILED', `Payload validation failed: ${violation}`, 'validation'));
    }
  }

  return { valid: errors.length === 0, errors };
}

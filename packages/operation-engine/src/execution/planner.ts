/**
 * Planner
 *
 * Translates an OperationRequest into an ExecutionPlan.
 * Resolves which facade or module action will be called, with which payload.
 * Does NOT execute anything.
 */

import type { OperationRequest } from '../core/operation.js';
import type { CommandDefinition } from '../core/command.js';
import { makeError, type OperationError } from '../core/operation-error.js';

export type ExecutionTarget =
  | { kind: 'facade'; connectorId: string; operation: string; payload: Record<string, unknown> }
  | { kind: 'module'; systemId: string; action: string; payload: Record<string, unknown> };

export interface ExecutionPlan {
  operationId: string;
  tenantId: string;
  commandName: string;
  target: ExecutionTarget;
  timeoutMs: number;
}

export interface PlannerResult {
  plan?: ExecutionPlan;
  error?: OperationError;
}

/** Default timeout if neither command nor engine config specifies one. */
const DEFAULT_PLAN_TIMEOUT_MS = 30_000;

export class Planner {
  plan(request: OperationRequest, commandDef?: CommandDefinition): PlannerResult {
    const timeoutMs = commandDef?.timeoutMs ?? DEFAULT_PLAN_TIMEOUT_MS;
    const { target } = request;

    if (target.connectorId) {
      // External connector operation
      // Payload must be a plain object; pass through as-is
      const payload = (
        request.payload !== null && typeof request.payload === 'object' && !Array.isArray(request.payload)
          ? request.payload
          : { data: request.payload }
      ) as Record<string, unknown>;

      return {
        plan: {
          operationId: request.operationId,
          tenantId: request.tenantId,
          commandName: request.commandName,
          timeoutMs,
          target: {
            kind: 'facade',
            connectorId: target.connectorId,
            operation: request.commandName,
            payload,
          },
        },
      };
    }

    if (target.systemId) {
      // Internal module operation
      const payload = (
        request.payload !== null && typeof request.payload === 'object' && !Array.isArray(request.payload)
          ? request.payload
          : { data: request.payload }
      ) as Record<string, unknown>;

      return {
        plan: {
          operationId: request.operationId,
          tenantId: request.tenantId,
          commandName: request.commandName,
          timeoutMs,
          target: {
            kind: 'module',
            systemId: target.systemId,
            action: request.commandName,
            payload,
          },
        },
      };
    }

    return {
      error: makeError(
        'TARGET_NOT_FOUND',
        `Cannot plan operation '${request.commandName}': target has neither connectorId nor systemId`,
        'execution',
      ),
    };
  }
}

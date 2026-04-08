/**
 * Operation
 *
 * An operation is a persisted record of a command request and its lifecycle.
 * One OperationRequest may produce one Operation; the Operation tracks status,
 * attempts, approval, and result.
 */

import type { OperationActor } from './actor.js';
import type { OperationTarget } from './target.js';
import type { OperationStatus } from './operation-status.js';
import type { OperationError } from './operation-error.js';

// ─── Request (input) ─────────────────────────────────────────────────────────

export interface OperationRequest {
  /** Client-assigned unique identifier for this request. */
  operationId: string;
  /** Command name: 'create_record', 'issue_invoice', 'publish_catalog_item'… */
  commandName: string;
  /** Optional profile scope. Null = use core command registry only. */
  profileId?: string;
  /** Tenant context — always required. */
  tenantId: string;
  /** Who or what is requesting this operation. */
  actor: OperationActor;
  /** What this operation acts upon. */
  target: OperationTarget;
  /** Command-specific payload. Shape is validated per commandName. */
  payload: unknown;
  /** Additional execution options (dry_run, priority, locale…). */
  options?: Record<string, unknown>;
  /** Caller-supplied context propagated to hooks and timeline entries. */
  context?: Record<string, unknown>;
  /**
   * Deduplication key. Scoped to (tenantId, idempotencyKey).
   * If provided, a duplicate submission returns the original operation.
   */
  idempotencyKey?: string;
  /** Tracing linkage across services. */
  correlationId?: string;
  /** ISO-8601 timestamp when the request was created by the caller. */
  requestedAt: string;
}

// ─── Record (persisted) ──────────────────────────────────────────────────────

export interface OperationRecord {
  /** Same as OperationRequest.operationId (ULID). */
  operationId: string;
  tenantId: string;
  commandName: string;
  profileId?: string;
  actor: OperationActor;
  target: OperationTarget;
  payload: unknown;
  options?: Record<string, unknown>;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  requestedAt: Date;
  status: OperationStatus;
  /** Set when validation or execution returns errors. */
  errors: OperationError[];
  /** Set when operation completes successfully. */
  result?: unknown;
  /** Number of execution attempts so far. */
  attemptCount: number;
  /** When the operation entered its current status. */
  statusUpdatedAt: Date;
  /** If approval is required, the ID of the ApprovalRequest. */
  approvalRequestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Result (output) ─────────────────────────────────────────────────────────

export interface OperationResult {
  operationId: string;
  tenantId: string;
  commandName: string;
  status: OperationStatus;
  errors: OperationError[];
  result?: unknown;
  attemptCount: number;
  durationMs: number;
}

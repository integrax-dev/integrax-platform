/**
 * Platform stores
 *
 * All stores require DATABASE_URL. If it is not set the process exits immediately
 * rather than silently falling back to in-memory state that would be lost on restart.
 */

import { PgSnapshotStore } from '../../store/pg-snapshot-store.js';
import { PgTimelineStore } from '../../store/pg-timeline-store.js';
import { PgOperationStore, PgOperationAttemptStore } from '../../store/pg-operation-store.js';
import { PgApprovalStore } from '../../store/pg-approval-store.js';
import { PgIdempotencyStore } from '../../store/pg-idempotency-store.js';
import { PgIdentityAliasStore } from '../../store/pg-identity-alias-store.js';

if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set. IntegraX requires a Postgres database.');
  process.exit(1);
}

export const snapshotStore     = new PgSnapshotStore();
export const timelineStore     = new PgTimelineStore();
export const operationStore    = new PgOperationStore();
export const attemptStore      = new PgOperationAttemptStore();
export const approvalStore     = new PgApprovalStore();
export const idempotencyStore  = new PgIdempotencyStore();
export const identityAliasStore = new PgIdentityAliasStore();

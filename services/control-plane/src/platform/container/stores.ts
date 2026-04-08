/**
 * Platform stores
 *
 * Exports all storage singletons for the control-plane.
 * Uses Postgres implementations when DATABASE_URL is set, InMemory otherwise.
 */

import {
  InMemorySnapshotStore,
  InMemoryTimelineStore,
  InMemoryOperationStore,
  InMemoryOperationAttemptStore,
  InMemoryApprovalStore,
  InMemoryIdempotencyStore,
} from './in-memory-fallbacks.js';
import { PgSnapshotStore } from '../../store/pg-snapshot-store.js';
import { PgTimelineStore } from '../../store/pg-timeline-store.js';
import { PgOperationStore, PgOperationAttemptStore } from '../../store/pg-operation-store.js';
import { PgApprovalStore } from '../../store/pg-approval-store.js';
import { PgIdempotencyStore } from '../../store/pg-idempotency-store.js';
import { PgIdentityAliasStore } from '../../store/pg-identity-alias-store.js';

const usePostgres = Boolean(process.env.DATABASE_URL);

export const snapshotStore = usePostgres ? new PgSnapshotStore() : new InMemorySnapshotStore();
export const timelineStore = usePostgres ? new PgTimelineStore() : new InMemoryTimelineStore();
export const operationStore = usePostgres ? new PgOperationStore() : new InMemoryOperationStore();
export const attemptStore = usePostgres ? new PgOperationAttemptStore() : new InMemoryOperationAttemptStore();
export const approvalStore = usePostgres ? new PgApprovalStore() : new InMemoryApprovalStore();
export const idempotencyStore = usePostgres ? new PgIdempotencyStore() : new InMemoryIdempotencyStore();
export const identityAliasStore = new PgIdentityAliasStore();

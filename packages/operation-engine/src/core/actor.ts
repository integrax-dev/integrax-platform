/**
 * OperationActor
 *
 * Who or what initiated the operation. Kept deliberately neutral —
 * does not encode ecommerce or any domain assumptions.
 */

export type ActorType = 'user' | 'system' | 'workflow' | 'module' | 'api';

export interface OperationActor {
  /** What kind of principal triggered this operation. */
  type: ActorType;
  /** Identifier of the principal (userId, workflowRunId, serviceId…). */
  id?: string;
  /** Role or permission level at the time of the request. */
  role?: string;
  /** Tenant the actor belongs to, if applicable. */
  tenantId?: string;
}

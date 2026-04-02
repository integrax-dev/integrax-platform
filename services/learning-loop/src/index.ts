export type CompatibilityClass = 'safe' | 'suspicious' | 'review-required' | 'breaking';

export interface MappingFeedbackEvent {
  tenantId: string;
  reportId: string;
  sourceConnectorId: string;
  targetConnectorId: string;
  sourcePath: string;
  targetPath: string;
  accepted: boolean;
  confidenceAtDecision: number;
  operatorUserId?: string;
  createdAt: string;
}

export interface ConfidenceEvent {
  id?: string;
  tenantId: string;
  entityType: 'mapping' | 'incident' | 'workflow';
  entityId: string;
  fromConfidence: number;
  toConfidence: number;
  reason: string;
  createdAt: string;
}

export function createMappingFeedbackEvent(
  input: Omit<MappingFeedbackEvent, 'createdAt'>,
): MappingFeedbackEvent {
  return {
    ...input,
    createdAt: new Date().toISOString(),
  };
}

export function shouldEscalateToHumanReview(
  compatibilityClass: CompatibilityClass,
  confidence: number,
): boolean {
  if (compatibilityClass === 'breaking') return true;
  if (compatibilityClass === 'review-required') return confidence < 0.95;
  return confidence < 0.75;
}

export interface QueryableClient {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
}

export function createConfidenceEvent(
  input: Omit<ConfidenceEvent, 'createdAt'>,
): ConfidenceEvent {
  return {
    ...input,
    createdAt: new Date().toISOString(),
  };
}

export async function recordMappingFeedbackEvent(
  client: QueryableClient,
  event: MappingFeedbackEvent & { id: string },
): Promise<void> {
  await client.query(
    `INSERT INTO mapping_feedback_events (
       id, tenant_id, report_id, source_connector_id, target_connector_id,
       source_path, target_path, accepted, confidence_at_decision, operator_user_id, created_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11
     )`,
    [
      event.id,
      event.tenantId,
      event.reportId,
      event.sourceConnectorId,
      event.targetConnectorId,
      event.sourcePath,
      event.targetPath,
      event.accepted,
      event.confidenceAtDecision,
      event.operatorUserId ?? null,
      event.createdAt,
    ],
  );
}

export async function recordConfidenceEvent(
  client: QueryableClient,
  event: ConfidenceEvent & { id: string },
): Promise<void> {
  await client.query(
    `INSERT INTO confidence_events (
       id, tenant_id, entity_type, entity_id, from_confidence, to_confidence, reason, created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8
     )`,
    [
      event.id,
      event.tenantId,
      event.entityType,
      event.entityId,
      event.fromConfidence,
      event.toConfidence,
      event.reason,
      event.createdAt,
    ],
  );
}

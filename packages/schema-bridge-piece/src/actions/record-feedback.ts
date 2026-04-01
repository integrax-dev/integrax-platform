import type { PieceAuthContext } from '@integrax/connector-sdk';

export interface EvidenceBreakdown {
  lexical: number;
  value: number;
  structural: number;
  businessType: number;
  ontology: number;
  sufficiency: number;
}

export interface RecordFeedbackInput {
  controlPlaneUrl: string;
  apiKey: string;
  reportId: string;
  sourcePath: string;
  targetPath: string;
  accepted: boolean;
  confidence: number;
  /** Breakdown de evidencia del mapping sugerido — alimenta pesos dinámicos de señal. */
  breakdown?: EvidenceBreakdown;
}

export async function runRecordFeedback(input: RecordFeedbackInput): Promise<{ accepted: boolean }> {
  const res = await fetch(
    `${input.controlPlaneUrl}/api/schemas/reports/${input.reportId}/feedback`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${input.apiKey}`,
      },
      body: JSON.stringify({
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        accepted: input.accepted,
        confidence: input.confidence,
        ...(input.breakdown ? { breakdown: input.breakdown } : {}),
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`recordFeedback failed ${res.status}: ${text}`);
  }

  const payload = await res.json() as { success: boolean; data: { accepted: boolean } };
  return { accepted: payload.data.accepted };
}

export async function buildRecordFeedbackPieceAction() {
  const { createAction, Property } = await import('@activepieces/pieces-framework');

  return createAction({
    name: 'record_feedback',
    displayName: 'Record Mapping Feedback',
    description: 'Persiste la decisión (accept/reject) sobre un mapping sugerido.',
    props: {
      reportId: Property.ShortText({ displayName: 'Report ID', required: true }),
      sourcePath: Property.ShortText({ displayName: 'Source Path', required: true }),
      targetPath: Property.ShortText({ displayName: 'Target Path', required: true }),
      accepted: Property.Checkbox({ displayName: 'Accepted', required: true }),
      confidence: Property.Number({ displayName: 'Confidence (0-1)', required: true }),
      breakdown_json: Property.LongText({
        displayName: 'Evidence Breakdown (JSON)',
        description: 'JSON con los scores por canal (lexical, value, structural, businessType, ontology, sufficiency). Opcional — alimenta los pesos dinámicos de señal.',
        required: false,
      }),
    },
    async run(ctx) {
      const auth = ctx.auth as unknown as PieceAuthContext;
      return runRecordFeedback({
        controlPlaneUrl: auth.controlPlaneUrl,
        apiKey: auth.apiKey,
        reportId: ctx.propsValue.reportId,
        sourcePath: ctx.propsValue.sourcePath,
        targetPath: ctx.propsValue.targetPath,
        accepted: ctx.propsValue.accepted,
        confidence: ctx.propsValue.confidence,
        // breakdown se pasa como JSON string desde el action prop, parseado aquí.
        breakdown: ctx.propsValue.breakdown_json
          ? JSON.parse(ctx.propsValue.breakdown_json as string) as EvidenceBreakdown
          : undefined,
      });
    },
  });
}

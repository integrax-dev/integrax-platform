import { SchemaBridge } from '@integrax/schema-bridge';
import type { BridgeReport } from '@integrax/schema-bridge';

export interface CompareSchemasPieceInput {
  connectorAId: string;
  connectorBId: string;
  tenantId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  anthropicApiKey?: string;
  enableLlmEscalation?: boolean;
  renameSimilarityThreshold?: number;
}

export async function runCompareSchemas(input: CompareSchemasPieceInput): Promise<BridgeReport> {
  const bridge = new SchemaBridge({
    anthropicApiKey: input.enableLlmEscalation ? input.anthropicApiKey : undefined,
  });

  return bridge.compare({
    connectorAId: input.connectorAId,
    connectorBId: input.connectorBId,
    tenantId: input.tenantId,
    samplesA: input.samplesA,
    samplesB: input.samplesB,
    options: {
      enableLlmEscalation: input.enableLlmEscalation ?? false,
      renameSimilarityThreshold: input.renameSimilarityThreshold ?? 0.70,
      maxLlmEscalations: 3,
    },
  });
}

export async function buildCompareSchemasPieceAction() {
  const { createAction, Property } = await import('@activepieces/pieces-framework');

  return createAction({
    name: 'compare_schemas',
    displayName: 'Compare Schemas',
    description: 'Detecta diferencias entre dos schemas y genera mappings con score de confianza.',
    props: {
      connectorAId: Property.ShortText({ displayName: 'Connector A ID', required: true }),
      connectorBId: Property.ShortText({ displayName: 'Connector B ID', required: true }),
      samplesA: Property.Json({ displayName: 'Samples A', required: true }),
      samplesB: Property.Json({ displayName: 'Samples B', required: true }),
      enableLlmEscalation: Property.Checkbox({
        displayName: 'Enable LLM escalation',
        description: 'Usa Claude para resolver pares ambiguos',
        defaultValue: false,
        required: false,
      }),
    },
    async run(ctx) {
      const auth = ctx.auth as unknown as import('../piece-auth.js').SchemaBridgePieceAuth;
      return runCompareSchemas({
        connectorAId: ctx.propsValue.connectorAId,
        connectorBId: ctx.propsValue.connectorBId,
        tenantId: auth.tenantRef,
        samplesA: ctx.propsValue.samplesA as unknown as Record<string, unknown>[],
        samplesB: ctx.propsValue.samplesB as unknown as Record<string, unknown>[],
        enableLlmEscalation: ctx.propsValue.enableLlmEscalation ?? false,
        renameSimilarityThreshold: 0.70,
      });
    },
  });
}

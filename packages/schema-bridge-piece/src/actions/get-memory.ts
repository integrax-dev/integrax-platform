import type { PieceAuthContext } from '@integrax/connector-sdk';

export interface MappingMemoryEntry {
  sourcePath: string;
  targetPath: string;
  acceptedCount: number;
  rejectedCount: number;
  averageConfidence: number;
  lastAcceptedAt?: string;
}

export interface GetMemoryInput {
  controlPlaneUrl: string;
  apiKey: string;
  connectorAId: string;
  connectorBId: string;
  tenantId: string;
}

export async function runGetMemory(input: GetMemoryInput): Promise<MappingMemoryEntry[]> {
  const url = new URL(`${input.controlPlaneUrl}/api/schemas/memory`);
  url.searchParams.set('connectorAId', input.connectorAId);
  url.searchParams.set('connectorBId', input.connectorBId);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `ApiKey ${input.apiKey}`,
      'X-Tenant-Id': input.tenantId,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getMemory failed ${res.status}: ${text}`);
  }

  const payload = await res.json() as { success: boolean; data: MappingMemoryEntry[] };
  return payload.data;
}

export async function buildGetMemoryPieceAction() {
  const { createAction, Property } = await import('@activepieces/pieces-framework');

  return createAction({
    name: 'get_mapping_memory',
    displayName: 'Get Mapping Memory',
    description: 'Obtiene los mappings históricos de alta confianza para un par de conectores.',
    props: {
      connectorAId: Property.ShortText({ displayName: 'Connector A ID', required: true }),
      connectorBId: Property.ShortText({ displayName: 'Connector B ID', required: true }),
    },
    async run(ctx) {
      const auth = ctx.auth as unknown as PieceAuthContext;
      return runGetMemory({
        controlPlaneUrl: auth.controlPlaneUrl,
        apiKey: auth.apiKey,
        tenantId: auth.tenantRef,
        connectorAId: ctx.propsValue.connectorAId,
        connectorBId: ctx.propsValue.connectorBId,
      });
    },
  });
}

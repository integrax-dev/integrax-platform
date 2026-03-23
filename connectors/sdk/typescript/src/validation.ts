/**
 * Utilities for early schema validation
 * Used to prevent parsing broken payloads and trigger the DiffEngineActivity fallback
 */

export class SchemaMismatchError extends Error {
  public sourcePayload: any;
  public expectedSchemaId: string;

  constructor(message: string, expectedSchemaId: string, sourcePayload: any) {
    super(message);
    this.name = 'SchemaMismatchError';
    this.expectedSchemaId = expectedSchemaId;
    this.sourcePayload = sourcePayload;
  }
}

/**
 * Validates an incoming payload against an expected structure/schema.
 * If fundamental properties are missing or types are completely wrong,
 * it throws a SchemaMismatchError which the kafka-consumer/worker
 * can catch to trigger the DiffEngineActivity.
 */
export function validatePayloadStructurally(payload: any, expectedProperties: string[], schemaId: string): void {
  if (!payload || typeof payload !== 'object') {
    throw new SchemaMismatchError('Payload is not an object', schemaId, payload);
  }

  // Basic validation check - real implementation would integrate with Ajv or Zod
  for (const prop of expectedProperties) {
    if (!(prop in payload)) {
      throw new SchemaMismatchError(\`Missing expected property: \${prop}\`, schemaId, payload);
    }
  }
}

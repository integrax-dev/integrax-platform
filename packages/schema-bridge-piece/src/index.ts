export { runCompareSchemas } from './actions/compare-schemas.js';
export { runRecordFeedback } from './actions/record-feedback.js';
export { runGetMemory } from './actions/get-memory.js';
export type { CompareSchemasPieceInput } from './actions/compare-schemas.js';
export type { RecordFeedbackInput } from './actions/record-feedback.js';
export type { MappingMemoryEntry } from '@integrax/schema-bridge';
export type { GetMemoryInput } from './actions/get-memory.js';

export async function registerSchemaBridgePiece() {
  const { createPiece } = await import('@activepieces/pieces-framework');
  const { buildCompareSchemasPieceAction } = await import('./actions/compare-schemas.js');
  const { buildRecordFeedbackPieceAction } = await import('./actions/record-feedback.js');
  const { buildGetMemoryPieceAction } = await import('./actions/get-memory.js');

  return createPiece({
    displayName: 'Schema Bridge',
    description: 'Detecta y resuelve diferencias de schema entre conectores con memoria de feedback.',
    logoUrl: 'https://raw.githubusercontent.com/integrax/assets/main/schema-bridge-logo.png',
    categories: [], // PieceCategory might be missing, starting with empty for now to pass build
    auth: undefined,
    minimumSupportedRelease: '0.20.0',
    authors: [],
    actions: [
      await buildCompareSchemasPieceAction(),
      await buildRecordFeedbackPieceAction(),
      await buildGetMemoryPieceAction(),
    ],
    triggers: [],
  });
}

import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from '../activities/schema-diff-activities.js';

const {
  generateSchemaDiff,
  persistDiffResult
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export interface SchemaDiffWorkflowInput {
  sourceSchemaId: string;
  targetSchemaId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  tenantId?: string;
  options?: {
    renameSimilarityThreshold?: number;
    enableLlmEscalation?: boolean;
    forceRecalculate?: boolean;
  };
}

/**
 * Workflow principal para comparar dos esquemas en base a muestras.
 *
 * Flujo:
 * 1. Ejecuta la Activity `generateSchemaDiff` (que internamente se encarga
 *    de validar el caché con Redis utilizando los fingerprints).
 * 2. Si hay diferencias o fue exitoso, persiste el resultado (simulado) 
 *    mediante la Activity `persistDiffResult`.
 * 3. Devuelve el reporte estandarizado.
 */
export async function schemaDiffWorkflow(input: SchemaDiffWorkflowInput): Promise<activities.DiffResult> {
  log.info('Iniciando SchemaDiffWorkflow', {
    source: input.sourceSchemaId,
    target: input.targetSchemaId,
    tenantId: input.tenantId
  });

  // 1. Generar Diff (esta actividad revisará el caché en Redis internamente)
  const diffResult = await generateSchemaDiff({
    sourceSchemaId: input.sourceSchemaId,
    targetSchemaId: input.targetSchemaId,
    samplesA: input.samplesA,
    samplesB: input.samplesB,
    tenantId: input.tenantId,
    options: input.options,
  });

  log.info(`Diff generado exitosamente. DiffResult reportId: ${diffResult.reportId}`);

  // 2. Persistir resultado (audit trail / base de datos)
  await persistDiffResult(diffResult);

  return diffResult;
}

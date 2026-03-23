import { Context } from '@temporalio/activity';

export interface DiffResult {
  sourceSchemaId: string;
  targetSchemaId: string;
  hasDifferences: boolean;
  mismatches: {
    addedFields: string[];
    removedFields: string[];
    typeChanges: Array<{ path: string; fromType: string; toType: string }>;
  };
  blueprint: any[];
  requiresLLMFallback: boolean;
}

/**
 * Motor de diferenciación determinístico para comparar dos esquemas u objetos en tiempo de ejecución.
 * Evita el uso de LLM para variaciones estructurales simples.
 */
export async function generateSchemaDiff(sourceSchema: any, targetSchema: any): Promise<DiffResult> {
  const addedFields: string[] = [];
  const removedFields: string[] = [];
  const typeChanges: Array<{ path: string, fromType: string, toType: string }> = [];
  const blueprint: any[] = [];
  let requiresLLM = false;

  function compareRecursive(srcVal: any, tgtVal: any, path: string) {
    if (srcVal === undefined && tgtVal !== undefined) {
      addedFields.push(path);
      blueprint.push({ action: "add", path: path, defaultDef: tgtVal });
    } else if (srcVal !== undefined && tgtVal === undefined) {
      removedFields.push(path);
      blueprint.push({ action: "remove", path: path });
    } else {
      const srcType = srcVal === null ? 'null' : typeof srcVal;
      const tgtType = tgtVal === null ? 'null' : typeof tgtVal;

      if (srcType !== tgtType) {
        typeChanges.push({ path, fromType: srcType, toType: tgtType });
        if ((srcType === 'string' && tgtType === 'number') || (srcType === 'number' && tgtType === 'string')) {
            blueprint.push({ action: "cast", path, from: srcType, to: tgtType });
        } else {
            // Complex type mismatch like object vs string needs LLM for semantic evaluation
            requiresLLM = true; 
        }
      } else if (srcType === 'object') {
        // En un motor real, aquí extraeríamos las propiedades de `properties` interactivamente.
        // Simulamos un diff básico entre definiciones estáticas (mock simplificado para el ejemplo)
        const keys = new Set([...Object.keys(srcVal), ...Object.keys(tgtVal)]);
        for (const key of keys) {
            compareRecursive(srcVal[key], tgtVal[key], path ? `${path}.${key}` : key);
        }
      }
    }
  }

  // Comparamos asumiendo que sourceSchema y targetSchema son objetos JSON planos o representaciones Schema
  compareRecursive(sourceSchema?.properties || sourceSchema, targetSchema?.properties || targetSchema, '');

  const hasDifferences = addedFields.length > 0 || removedFields.length > 0 || typeChanges.length > 0;

  return {
    sourceSchemaId: sourceSchema.$id || 'unknown_source',
    targetSchemaId: targetSchema.$id || 'unknown_target',
    hasDifferences,
    mismatches: { addedFields, removedFields, typeChanges },
    blueprint,
    requiresLLMFallback: requiresLLM,
  };
}

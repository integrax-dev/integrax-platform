/**
 * Drift Detector
 *
 * Detecta drift significativo en el schema comparando la confianza promedio
 * de los mappings actuales contra el baseline histórico almacenado en memoria.
 *
 * Un drift se dispara cuando:
 *   - La caída de confianza supera DRIFT_CONFIDENCE_THRESHOLD (0.20)
 *   - O hay un número anómalo de campos sin contraparte
 */

import type { DriftDetail, FieldMapping, MappingMemoryEntry } from './types.js';

const DRIFT_CONFIDENCE_THRESHOLD = 0.20;

/**
 * Detecta drift comparando los mappings actuales contra la memoria histórica.
 *
 * @param mappings - Mappings generados en la comparación actual
 * @param memoryEntries - Entradas de memoria histórica del par de conectores
 * @param unmatchedA - Número de campos en A sin contraparte (field_removed huérfanos)
 * @param unmatchedB - Número de campos en B sin contraparte (field_added huérfanos)
 * @param typeChangedPaths - Paths que cambiaron de tipo en el diff actual
 * @returns DriftDetail si se detecta drift, null en caso contrario
 */
export function detectDrift(
  mappings: FieldMapping[],
  memoryEntries: MappingMemoryEntry[],
  unmatchedA: number,
  unmatchedB: number,
  typeChangedPaths: string[],
): DriftDetail | null {
  if (memoryEntries.length === 0) return null;

  // Confianza promedio de los mappings aceptados en memoria (baseline)
  const acceptedMemory = memoryEntries.filter(e => e.acceptedCount > 0);
  if (acceptedMemory.length === 0) return null;

  const baselineAvgConfidence =
    acceptedMemory.reduce((sum, e) => sum + e.averageConfidence, 0) / acceptedMemory.length;

  // Confianza promedio de los mappings actuales con contraparte
  const activeMappings = mappings.filter(m => m.pathA && m.pathB);
  if (activeMappings.length === 0) return null;

  const currentAvgConfidence =
    activeMappings.reduce((sum, m) => sum + m.confidence, 0) / activeMappings.length;

  const confidenceDrop = baselineAvgConfidence - currentAvgConfidence;

  if (confidenceDrop < DRIFT_CONFIDENCE_THRESHOLD) return null;

  return {
    currentAvgConfidence,
    baselineAvgConfidence,
    confidenceDrop,
    unmatchedFieldsA: unmatchedA,
    unmatchedFieldsB: unmatchedB,
    typeChanges: typeChangedPaths,
  };
}

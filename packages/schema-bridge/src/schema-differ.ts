/**
 * Schema Differ
 *
 * Compara dos InferredJsonSchema y produce una lista plana de FieldDiff.
 * Función pura — sin I/O, sin LLM.
 * Los rename_candidates se generan en similarity-engine, no aquí.
 */

import type { FieldDiff, InferredJsonSchema, SchemaField, SchemaNode } from './types.js';
import { TypeResolver } from './type-resolver.js';

function normalizeType(node: SchemaNode): string {
  if (Array.isArray(node.type)) {
    // Usar el primer tipo no-null
    return node.type.find(t => t !== 'null') ?? 'null';
  }
  return node.type;
}

function computeBreakingScore(kind: FieldDiff['kind'], node?: SchemaNode | null, nodeB?: SchemaNode | null): number {
  const resolver = new TypeResolver();
  switch (kind) {
    case 'field_removed': return 1.0;
    case 'type_changed': {
      if (!node || !nodeB) return 0.9;
      const res = resolver.resolve(
        normalizeType(node), normalizeType(nodeB),
        node.format, nodeB.format,
      );
      return resolver.toBreakingScore(res.compatibility);
    }
    case 'format_changed': return 0.5;
    case 'nullability_changed': return 0.4;
    case 'constraint_changed': return 0.3;
    case 'field_added': return 0.0;
    case 'rename_candidate': return 0.2;
    default: return 0.5;
  }
}

// ─── SchemaDiffer ─────────────────────────────────────────────────────────────

export class SchemaDiffer {
  /**
   * Produce un array de FieldDiff comparando schemaA con schemaB.
   * NO genera rename_candidate — eso lo hace SimilarityEngine.
   */
  diff(schemaA: InferredJsonSchema, schemaB: InferredJsonSchema): FieldDiff[] {
    const mapA = new Map<string, SchemaField>(schemaA.fields.map(f => [f.path, f]));
    const mapB = new Map<string, SchemaField>(schemaB.fields.map(f => [f.path, f]));

    const pathsA = new Set(mapA.keys());
    const pathsB = new Set(mapB.keys());

    const diffs: FieldDiff[] = [];

    // Campos solo en A → field_removed
    for (const path of pathsA) {
      if (!pathsB.has(path)) {
        const fieldA = mapA.get(path)!;
        diffs.push({
          kind: 'field_removed',
          pathA: path,
          pathB: null,
          nodeA: fieldA.node,
          nodeB: null,
          breakingScore: computeBreakingScore('field_removed'),
        });
      }
    }

    // Campos solo en B → field_added
    for (const path of pathsB) {
      if (!pathsA.has(path)) {
        const fieldB = mapB.get(path)!;
        diffs.push({
          kind: 'field_added',
          pathA: null,
          pathB: path,
          nodeA: null,
          nodeB: fieldB.node,
          breakingScore: computeBreakingScore('field_added'),
        });
      }
    }

    // Campos en ambos → detectar cambios
    for (const path of pathsA) {
      if (!pathsB.has(path)) continue;

      const fieldA = mapA.get(path)!;
      const fieldB = mapB.get(path)!;
      const nodeA = fieldA.node;
      const nodeB = fieldB.node;

      const typeA = normalizeType(nodeA);
      const typeB = normalizeType(nodeB);

      // Cambio de tipo
      if (typeA !== typeB) {
        diffs.push({
          kind: 'type_changed',
          pathA: path,
          pathB: path,
          nodeA,
          nodeB,
          breakingScore: computeBreakingScore('type_changed', nodeA, nodeB),
        });
        continue; // Si el tipo cambió no analizamos formato por separado
      }

      // Cambio de formato (mismo tipo base)
      if (nodeA.format !== nodeB.format && (nodeA.format || nodeB.format)) {
        diffs.push({
          kind: 'format_changed',
          pathA: path,
          pathB: path,
          nodeA,
          nodeB,
          breakingScore: computeBreakingScore('format_changed'),
        });
        continue;
      }

      // Cambio de nullabilidad
      if (fieldA.required !== fieldB.required) {
        diffs.push({
          kind: 'nullability_changed',
          pathA: path,
          pathB: path,
          nodeA,
          nodeB,
          breakingScore: computeBreakingScore('nullability_changed'),
        });
      }

      // Cambio de enum
      if (nodeA.enum && nodeB.enum) {
        const setA = new Set(nodeA.enum.map(v => JSON.stringify(v)));
        const setB = new Set(nodeB.enum.map(v => JSON.stringify(v)));
        const hasChanges = [...setA].some(v => !setB.has(v)) || [...setB].some(v => !setA.has(v));
        if (hasChanges) {
          diffs.push({
            kind: 'constraint_changed',
            pathA: path,
            pathB: path,
            nodeA,
            nodeB,
            breakingScore: computeBreakingScore('constraint_changed'),
          });
        }
      }
    }

    // Ordenar: breaking primero
    diffs.sort((a, b) => b.breakingScore - a.breakingScore);

    return diffs;
  }
}

export function createSchemaDiffer(): SchemaDiffer {
  return new SchemaDiffer();
}

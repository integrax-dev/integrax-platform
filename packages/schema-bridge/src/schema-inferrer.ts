/**
 * Schema Inferrer
 *
 * Convierte un array de muestras JSON en un InferredJsonSchema canónico.
 * Sin dependencias externas — pura lógica determinística.
 */

import { createHash } from 'node:crypto';
import type { InferredJsonSchema, JsonPrimitiveType, SchemaField, SchemaNode } from './types.js';

const MAX_EXAMPLES = 10;

// ─── Canonicalización (igual que connector-watchdog/schema-fingerprinter) ─────

function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalise).join(',') + ']';
  const sorted = Object.keys(value as object)
    .sort()
    .map(k => `"${k}":${canonicalise((value as Record<string, unknown>)[k])}`);
  return '{' + sorted.join(',') + '}';
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

// ─── Detección de formato para strings ───────────────────────────────────────

function isLatLon(value: string): boolean {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return false;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

const FORMAT_DETECTORS: Array<{ format: string; test: (v: string) => boolean }> = [
  { format: 'ar-cuit', test: v => /^\d{2}-\d{8}-\d{1}$/.test(v) },
  { format: 'uuid', test: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) },
  { format: 'iso-currency', test: v => /^[A-Z]{3}$/.test(v.trim()) },
  { format: 'lat-lon', test: isLatLon },
  { format: 'date-time', test: v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) },
  { format: 'date', test: v => /^\d{4}-\d{2}-\d{2}$/.test(v) },
  { format: 'email', test: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) },
  { format: 'uri', test: v => /^https?:\/\//.test(v) },
];

const MONEY_FIELD_PATTERN = /monto|importe|precio|amount|valor|costo|tarifa|total/i;

function detectStringFormat(value: string, fieldPath: string): string | undefined {
  for (const { format, test } of FORMAT_DETECTORS) {
    if (test(value)) return format;
  }
  // Detectar montos como string (ej: "1500.50", "1.500,00")
  if (MONEY_FIELD_PATTERN.test(fieldPath)) {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    if (!isNaN(parseFloat(normalized)) && /^\d/.test(value)) {
      return 'ar-money-string';
    }
  }
  return undefined;
}

// ─── Internos de traversal ────────────────────────────────────────────────────

interface PathEntry {
  appearances: number;
  node: SchemaNode;
}

function getJsonType(v: unknown): JsonPrimitiveType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return 'number';
  if (t === 'string') return 'string';
  if (t === 'object') return 'object';
  return 'null';
}

function mergeNodes(existing: SchemaNode, incoming: SchemaNode): SchemaNode {
  const existingTypes = Array.isArray(existing.type) ? existing.type : [existing.type];
  const incomingTypes = Array.isArray(incoming.type) ? incoming.type : [incoming.type];

  const mergedTypes = Array.from(new Set([...existingTypes, ...incomingTypes]));
  const type: JsonPrimitiveType | JsonPrimitiveType[] =
    mergedTypes.length === 1 ? mergedTypes[0] : mergedTypes;

  // Unión de enums
  let mergedEnum: unknown[] | undefined;
  if (existing.enum && incoming.enum) {
    mergedEnum = Array.from(new Set([...existing.enum, ...incoming.enum]));
  }

  // Preservar hasta MAX_EXAMPLES ejemplos, incluyendo repetidos, para medir entropia/cardinalidad
  const examples = [...existing.examples];
  for (const ex of incoming.examples) {
    if (examples.length >= MAX_EXAMPLES) break;
    examples.push(ex);
  }

  return {
    type,
    format: existing.format ?? incoming.format,
    nullable: existing.nullable || incoming.nullable,
    examples,
    children: existing.children,
    itemSchema: existing.itemSchema,
    enum: mergedEnum,
  };
}

function traverseValue(
  value: unknown,
  path: string,
  pathMap: Map<string, PathEntry>,
  sampleIndex: number,
): void {
  const type = getJsonType(value);

  let node: SchemaNode;

  if (type === 'null') {
    node = { type: 'null', nullable: true, examples: [null] };
  } else if (type === 'boolean') {
    node = { type: 'boolean', nullable: false, examples: [value] };
  } else if (type === 'number') {
    const isInt = Number.isInteger(value);
    node = {
      type: 'number',
      format: isInt ? 'int64' : 'double',
      nullable: false,
      examples: [value],
    };
  } else if (type === 'string') {
    const strVal = value as string;
    const format = detectStringFormat(strVal, path);
    node = {
      type: 'string',
      format,
      nullable: false,
      examples: [strVal],
    };
  } else if (type === 'object') {
    const obj = value as Record<string, unknown>;
    const children: Record<string, SchemaNode> = {};
    for (const [key, childVal] of Object.entries(obj)) {
      const childPath = path ? `${path}.${key}` : key;
      traverseValue(childVal, childPath, pathMap, sampleIndex);
    }
    node = { type: 'object', nullable: false, examples: [], children };
  } else {
    // array
    const arr = value as unknown[];
    let itemSchema: SchemaNode | undefined;
    const slice = arr.slice(0, 10);
    for (let i = 0; i < slice.length; i++) {
      const itemPath = `${path}[*]`;
      traverseValue(slice[i], itemPath, pathMap, sampleIndex);
    }
    node = { type: 'array', nullable: false, examples: [], itemSchema };
  }

  const existing = pathMap.get(path);
  if (existing) {
    existing.appearances++;
    existing.node = mergeNodes(existing.node, node);
  } else {
    pathMap.set(path, { appearances: 1, node });
  }
}

function hasDescendantPath(path: string, allPaths: string[]): boolean {
  const objectPrefix = `${path}.`;
  const arrayPrefix = `${path}[*]`;
  return allPaths.some(other =>
    other !== path && (other.startsWith(objectPrefix) || other.startsWith(arrayPrefix))
  );
}

function shouldIncludeField(path: string, node: SchemaNode, allPaths: string[]): boolean {
  const types = Array.isArray(node.type) ? node.type : [node.type];
  const isContainer = types.includes('object') || types.includes('array');
  if (!isContainer) return true;
  return !hasDescendantPath(path, allPaths);
}

// ─── SchemaInferrer ───────────────────────────────────────────────────────────

export class SchemaInferrer {
  /**
   * Infiere un InferredJsonSchema a partir de un array de muestras JSON.
   * Complejidad: O(n * m) donde n = muestras, m = campos por muestra.
   */
  infer(samples: Record<string, unknown>[]): InferredJsonSchema {
    const pathMap = new Map<string, PathEntry>();

    for (let i = 0; i < samples.length; i++) {
      traverseValue(samples[i], '', pathMap, i);
    }

    // Eliminar la ruta raíz vacía
    pathMap.delete('');

    const sampleCount = samples.length;
    const requiredThreshold = 0.80;

    const allPaths = [...pathMap.keys()];
    const fields: SchemaField[] = [];
    for (const [path, entry] of pathMap) {
      const node = entry.node;
      if (!shouldIncludeField(path, node, allPaths)) continue;
      const required = entry.appearances / sampleCount >= requiredThreshold;

      // Marcar nullable si el campo no está en todas las muestras
      if (entry.appearances < sampleCount) {
        node.nullable = true;
      }

      fields.push({ path, required, node });
    }

    // Ordenar por path para determinismo
    fields.sort((a, b) => a.path.localeCompare(b.path));

    const fingerprint = sha256(canonicalise(
      fields.map(f => ({ path: f.path, type: f.node.type, format: f.node.format }))
    ));

    return { fields, fingerprint, sampleCount };
  }
}

export function createSchemaInferrer(): SchemaInferrer {
  return new SchemaInferrer();
}

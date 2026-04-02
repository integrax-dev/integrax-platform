/**
 * Schema Inferrer
 *
 * Convierte un array de muestras JSON en un InferredJsonSchema canónico.
 * Preserva evidencia suficiente para que el motor pueda razonar sobre
 * cobertura, nullability, entropía y calidad estadística.
 */

import { createHash } from 'node:crypto';
import {
  defaultBusinessTypeProviders,
  detectBusinessFormat,
} from './business-type-registry.js';
import type {
  FieldEvidence,
  InferredJsonSchema,
  JsonPrimitiveType,
  SchemaField,
  SchemaInferrerConfig,
  SchemaNode,
} from './types.js';

const DEFAULT_MAX_EXAMPLES = 200;
const FINGERPRINT_LENGTH = 32;
const PLACEHOLDER_TOKENS = new Set([
  '',
  '-',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'tbd',
]);

function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalise).join(',') + ']';
  const sorted = Object.keys(value as object)
    .sort()
    .map(key => `"${key}":${canonicalise((value as Record<string, unknown>)[key])}`);
  return '{' + sorted.join(',') + '}';
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, FINGERPRINT_LENGTH);
}

const MONEY_FIELD_PATTERN = /monto|importe|precio|amount|valor|costo|tarifa|total/i;

function detectStringFormat(value: string, fieldPath: string, config: Required<SchemaInferrerConfig>): string | undefined {
  const format = detectBusinessFormat(
    value,
    fieldPath,
    config.businessTypeProviders,
  );
  if (format) return format;

  if (MONEY_FIELD_PATTERN.test(fieldPath)) {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    if (!Number.isNaN(Number.parseFloat(normalized)) && /^\d/.test(value)) {
      return 'ar-money-string';
    }
  }
  return undefined;
}

interface PathEntry {
  appearances: number;
  node: SchemaNode;
}

function getJsonType(value: unknown): JsonPrimitiveType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'object':
      return 'object';
    default:
      return 'null';
  }
}

function normalizeEvidenceValue(value: unknown): string {
  if (value === null) return '<null>';
  if (value === undefined) return '<undefined>';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }
  return JSON.stringify(value);
}

function isPlaceholderLike(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_TOKENS.has(value.trim().toLowerCase());
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mergeNodes(existing: SchemaNode, incoming: SchemaNode, maxExamples: number): SchemaNode {
  const existingTypes = Array.isArray(existing.type) ? existing.type : [existing.type];
  const incomingTypes = Array.isArray(incoming.type) ? incoming.type : [incoming.type];
  const mergedTypes = Array.from(new Set([...existingTypes, ...incomingTypes]));

  let mergedEnum: unknown[] | undefined;
  if (existing.enum && incoming.enum) {
    mergedEnum = Array.from(new Set([...existing.enum, ...incoming.enum]));
  } else {
    mergedEnum = existing.enum ?? incoming.enum;
  }

  const examples = [...existing.examples];
  for (const example of incoming.examples) {
    if (examples.length >= maxExamples) break;
    examples.push(example);
  }

  return {
    type: mergedTypes.length === 1 ? mergedTypes[0] : mergedTypes,
    format: existing.format ?? incoming.format,
    nullable: existing.nullable || incoming.nullable,
    examples,
    children: existing.children,
    itemSchema: existing.itemSchema,
    enum: mergedEnum,
    evidence: existing.evidence ?? incoming.evidence,
  };
}

function traverseValue(
  value: unknown,
  path: string,
  pathMap: Map<string, PathEntry>,
  config: Required<SchemaInferrerConfig>,
): void {
  const type = getJsonType(value);

  let node: SchemaNode;

  if (type === 'null') {
    node = { type: 'null', nullable: true, examples: [null] };
  } else if (type === 'boolean') {
    node = { type: 'boolean', nullable: false, examples: [value] };
  } else if (type === 'number') {
    node = {
      type: 'number',
      format: Number.isInteger(value) ? 'int64' : 'double',
      nullable: false,
      examples: [value],
    };
  } else if (type === 'string') {
    const stringValue = value as string;
    node = {
      type: 'string',
      format: detectStringFormat(stringValue, path, config),
      nullable: false,
      examples: [stringValue],
    };
  } else if (type === 'object') {
    const objectValue = value as Record<string, unknown>;
    const children: Record<string, SchemaNode> = {};
    for (const [key, childValue] of Object.entries(objectValue)) {
      const childPath = path ? `${path}.${key}` : key;
      traverseValue(childValue, childPath, pathMap, config);
    }
    node = { type: 'object', nullable: false, examples: [], children };
  } else {
    const arrayValue = value as unknown[];
    for (const item of arrayValue.slice(0, config.maxExamples)) {
      const itemPath = `${path}[*]`;
      traverseValue(item, itemPath, pathMap, config);
    }
    node = { type: 'array', nullable: false, examples: [], itemSchema: undefined };
  }

  const existing = pathMap.get(path);
  if (existing) {
    existing.appearances++;
    existing.node = mergeNodes(existing.node, node, config.maxExamples);
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
  const nodeTypes = Array.isArray(node.type) ? node.type : [node.type];
  const isContainer = nodeTypes.includes('object') || nodeTypes.includes('array');
  if (!isContainer) return true;
  return !hasDescendantPath(path, allPaths);
}

function buildFieldEvidence(node: SchemaNode, sampleCount: number, appearances: number): FieldEvidence {
  // Do NOT slice by `sampleCount`. `node.examples` already contains up to `maxExamples` 
  // elements, which correctly represents flattened array contents across all root samples.
  const examples = node.examples;
  const normalizedExamples = examples.map(normalizeEvidenceValue);
  const nonNullValues = examples.filter(example => example !== null && example !== undefined);
  const placeholderCount = nonNullValues.filter(isPlaceholderLike).length;
  const distinctValues = new Set(
    nonNullValues
      .filter(example => !isPlaceholderLike(example))
      .map(normalizeEvidenceValue)
  );

  const nonNullCount = nonNullValues.length;
  // If field is in an array, appearances can exceed root sampleCount.
  const maxPossible = Math.max(sampleCount, appearances);
  const nullCount = Math.max(0, maxPossible - nonNullCount);
  const coverageRatio = maxPossible === 0 ? 0 : Math.min(1, nonNullCount / maxPossible);
  const placeholderRatio = nonNullCount === 0 ? 0 : placeholderCount / nonNullCount;
  const uniqueCount = distinctValues.size;
  const usableCount = Math.max(0, normalizedExamples.length - placeholderCount);
  const diversityRatio = usableCount === 0 ? 0 : uniqueCount / usableCount;

  let evidenceQuality = clamp01(
    0.45 * coverageRatio +
    0.35 * (1 - placeholderRatio) +
    0.20 * Math.sqrt(Math.min(1, diversityRatio))
  );

  if (nonNullCount <= 1) {
    evidenceQuality *= 0.55;
  } else if (nonNullCount <= 3) {
    evidenceQuality *= 0.80;
  }

  return {
    sampleCount,
    nonNullCount,
    nullCount,
    uniqueCount,
    coverageRatio,
    placeholderCount,
    placeholderRatio,
    evidenceQuality: clamp01(evidenceQuality),
  };
}

export class SchemaInferrer {
  private readonly config: Required<SchemaInferrerConfig>;

  constructor(config: SchemaInferrerConfig = {}) {
    this.config = {
      businessTypeProviders: config.businessTypeProviders ?? defaultBusinessTypeProviders,
      maxExamples: config.maxExamples ?? DEFAULT_MAX_EXAMPLES,
    };
  }

  infer(samples: Record<string, unknown>[]): InferredJsonSchema {
    const pathMap = new Map<string, PathEntry>();

    for (const sample of samples) {
      traverseValue(sample, '', pathMap, this.config);
    }

    pathMap.delete('');

    const sampleCount = samples.length;
    const requiredThreshold = 0.80;
    const allPaths = [...pathMap.keys()];

    // Reconstruct children references for structural entropy calculations
    for (const [path, entry] of pathMap) {
      const nodeTypes = Array.isArray(entry.node.type) ? entry.node.type : [entry.node.type];
      
      if (nodeTypes.includes('object')) {
        entry.node.children = entry.node.children || {};
        const prefix = path ? `${path}.` : '';
        for (const otherPath of allPaths) {
          if (otherPath.startsWith(prefix) && otherPath !== path) {
            const childKey = otherPath.slice(prefix.length).split(/[\.\[]/)[0];
            if (childKey && !entry.node.children![childKey]) {
              entry.node.children![childKey] = { type: 'null', nullable: true, examples: [] };
            }
          }
        }
      } else if (nodeTypes.includes('array')) {
        if (!entry.node.itemSchema) {
          entry.node.itemSchema = { type: 'object', nullable: false, examples: [], children: {} };
        }
        const itemSchema = entry.node.itemSchema;
        itemSchema.children = itemSchema.children || {};
        const prefix = `${path}[*].`;
        for (const otherPath of allPaths) {
          if (otherPath.startsWith(prefix)) {
            const childKey = otherPath.slice(prefix.length).split(/[\.\[]/)[0];
            if (childKey && !itemSchema.children![childKey]) {
              itemSchema.children![childKey] = { type: 'null', nullable: true, examples: [] };
            }
          }
        }
      }
    }

    const fields: SchemaField[] = [];

    for (const [path, entry] of pathMap) {
      const node = entry.node;
      if (!shouldIncludeField(path, node, allPaths)) continue;

      if (entry.appearances < sampleCount) {
        node.nullable = true;
      }
      node.evidence = buildFieldEvidence(node, sampleCount, entry.appearances);

      // Protect against arrays incrementing appearances beyond sampleCount 
      // when evaluating if the field is strictly required at root level
      const isRequired = (Math.min(sampleCount, entry.appearances) / sampleCount) >= requiredThreshold;
      fields.push({
        path,
        required: isRequired,
        node,
      });
    }

    fields.sort((left, right) => left.path.localeCompare(right.path));

    const fingerprint = sha256(canonicalise(
      fields.map(field => ({
        path: field.path,
        type: field.node.type,
        format: field.node.format,
      }))
    ));

    return { fields, fingerprint, sampleCount };
  }
}

export function createSchemaInferrer(config: SchemaInferrerConfig = {}): SchemaInferrer {
  return new SchemaInferrer(config);
}

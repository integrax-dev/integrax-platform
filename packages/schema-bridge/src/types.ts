/**
 * @integrax/schema-bridge — Types
 *
 * Todos los tipos y esquemas Zod para el motor de comparación entre sistemas.
 */

import { z } from 'zod';

// ─── Nodo de esquema inferido ──────────────────────────────────────────────────

export type JsonPrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface SchemaNode {
  /** Tipo JSON. Puede ser array si hay tipos mixtos (ej: ["string", "null"]). */
  type: JsonPrimitiveType | JsonPrimitiveType[];
  /** Formato semántico (date, date-time, email, uuid, uri, ar-cuit, ar-money-string) */
  format?: string;
  /** El campo puede ser null en las muestras */
  nullable: boolean;
  /** Muestras de ejemplo (máx 3) */
  /** Muestras de ejemplo retenidas para la señal estadística (configurable, default 200) */
  examples: unknown[];
  /** Hijos si type === 'object' */
  children?: Record<string, SchemaNode>;
  /** Esquema del item si type === 'array' */
  itemSchema?: SchemaNode;
  /** Valores posibles si se detectó un enum */
  enum?: unknown[];
  /** Calidad y cobertura observada de las muestras para este campo. */
  evidence?: FieldEvidence;
}

export interface SchemaField {
  /** Ruta en dot-notation, ej: "order.customer.email" */
  path: string;
  /** true si el campo aparece en ≥80% de las muestras */
  required: boolean;
  node: SchemaNode;
}

export interface InferredJsonSchema {
  fields: SchemaField[];
  /** SHA-256 (32 chars) del esquema canonicalizado */
  fingerprint: string;
  /** Total de muestras procesadas */
  sampleCount: number;
}

export interface BusinessTypeDetectionContext {
  fieldPath: string;
  value: string;
}

export interface BusinessTypeProvider {
  id: string;
  format: string;
  detect(context: BusinessTypeDetectionContext): boolean;
}

export type BusinessTypeWeightMap = Record<string, number>;

export interface FieldEvidence {
  sampleCount: number;
  nonNullCount: number;
  nullCount: number;
  uniqueCount: number;
  coverageRatio: number;
  placeholderCount: number;
  placeholderRatio: number;
  evidenceQuality: number;
}

export interface OntologyMatchContext {
  pathA: string;
  pathB: string;
  nodeA: SchemaNode | null;
  nodeB: SchemaNode | null;
}

export interface OntologyMatch {
  score: number;
  label: string;
  reason: string;
}

export interface OntologyProvider {
  id: string;
  match(context: OntologyMatchContext): OntologyMatch | null;
}

export interface MappingMemoryEntry {
  sourcePath: string;
  targetPath: string;
  /** Scope opcional: si se provee, la entrada solo aplica a este par de conectores. */
  connectorAId?: string;
  connectorBId?: string;
  acceptedCount: number;
  rejectedCount: number;
  averageConfidence: number;
  lastAcceptedAt?: string;
}

// ─── Diff ────────────────────────────────────────────────────────────────────

export type DiffKind =
  | 'field_added'
  | 'field_removed'
  | 'type_changed'
  | 'format_changed'
  | 'nullability_changed'
  | 'rename_candidate'
  | 'constraint_changed';

export interface SimilarityScore {
  levenshtein: number;
  jaccard: number;
  semantic: number;
  /** Statistical overlap over observed sample values. */
  value: number;
  combined: number;
  /** Difference between this candidate and the runner-up for the same source field. */
  margin?: number;
  /** Difference between this candidate and the runner-up for the same target field. */
  reciprocalMargin?: number;
  decision?: SimilarityDecision;
  evidenceQuality?: number;
  evidenceBreakdown?: SimilarityEvidenceBreakdown;
}

export type SimilarityDecision = 'auto_accept' | 'review' | 'reject';

export interface SimilarityEvidenceBreakdown {
  lexical: number;
  value: number;
  structural: number;
  businessType: number;
  ontology: number;
  sufficiency: number;
}

export interface SimilarityDecisionPolicyConfig {
  autoAcceptThreshold?: number;
  reviewThreshold?: number;
  minConfidenceMargin?: number;
}

export interface FieldDiff {
  kind: DiffKind;
  pathA: string | null;
  pathB: string | null;
  nodeA: SchemaNode | null;
  nodeB: SchemaNode | null;
  /** 0.0–1.0, donde 1.0 es breaking crítico */
  breakingScore: number;
  /** Solo para rename_candidate */
  similarity?: SimilarityScore;
}

export interface SchemaDiff {
  diffs: FieldDiff[];
  schemaA: InferredJsonSchema;
  schemaB: InferredJsonSchema;
  generatedAt: string;
}

// ─── Compatibilidad de tipos ──────────────────────────────────────────────────

export type TypeCompatibility =
  | 'identical'
  | 'widening'
  | 'narrowing'
  | 'coercible'
  | 'incompatible';

export interface TypeResolution {
  compatibility: TypeCompatibility;
  /** Expresión JS segura (sin eval), ej: "Number(v)" */
  coercionFn: string | null;
  requiresValidation: boolean;
  lossOfPrecision: boolean;
  description: string;
}

// ─── Resolución de conflictos ────────────────────────────────────────────────

export type ConflictClass = 'deterministic' | 'heuristic' | 'ambiguous';

export type TransformKind =
  | 'identity'
  | 'rename'
  | 'coerce_type'
  | 'restructure'
  | 'constant'
  | 'split'
  | 'merge';

export interface TransformSpec {
  kind: TransformKind;
  fromPath: string | null;
  toPath: string | null;
  /** Expresión JS segura para coerción */
  coercionFn?: string;
  /** Valor constante para campos nuevos sin contraparte */
  constant?: unknown;
  description: string;
}

export interface FieldMapping {
  id: string;
  pathA: string | null;
  pathB: string | null;
  transform: TransformSpec;
  confidence: number;
  bidirectional: boolean;
  /** Expresión inversa para B→A */
  inverseCoercionFn?: string;
}

export interface ResolvedConflict {
  diff: FieldDiff;
  resolution: ConflictClass;
  mapping: FieldMapping | null;
  confidence: number;
  llmRequired: boolean;
  /** Explicación en español del motivo de escalación al LLM */
  llmReason?: string;
}

// ─── Reporte de requerimientos funcionales ────────────────────────────────────

export type RequirementPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type RequirementCategory =
  | 'data_type'
  | 'field_mapping'
  | 'schema_restructure'
  | 'new_capability'
  | 'breaking_removal';

export type EffortEstimate = 'trivial' | 'low' | 'medium' | 'high';

export interface FunctionalRequirement {
  id: string;
  priority: RequirementPriority;
  title: string;
  description: string;
  affectedFields: string[];
  effortEstimate: EffortEstimate;
  category: RequirementCategory;
  autoResolved: boolean;
  generatedTransform?: string;
}

export interface LLMEscalation {
  diff: FieldDiff;
  reason: string;
  /** Semilla de prompt en español para el operador o el LLM */
  promptSeed: string;
}

export interface RequirementsReport {
  /** Cambios que rompen la integración existente */
  breaking: FunctionalRequirement[];
  /** Cambios que NO rompen pero requieren actualización */
  nonBreaking: FunctionalRequirement[];
  /** Solo informativos, sin código a cambiar */
  informational: FunctionalRequirement[];
  /** Conflictos que requieren intervención manual o LLM */
  llmEscalations: LLMEscalation[];
  summary: {
    totalDiffs: number;
    breakingCount: number;
    nonBreakingCount: number;
    informationalCount: number;
    llmEscalationCount: number;
    resolvedDeterministically: number;
    resolvedByHeuristic: number;
    coveragePercent: number;
  };
}

// ─── Notificación a clientes ──────────────────────────────────────────────────

export type ChangeSeverity = 'info' | 'minor' | 'major' | 'critical';

export interface ClientUpdateNotification {
  connectorAId: string;
  connectorBId: string;
  reportId: string;
  severity: ChangeSeverity;
  breakingChanges: number;
  nonBreakingChanges: number;
  timestamp: string;
  tenantId?: string;
}

// ─── Reporte completo (salida principal del bridge) ──────────────────────────

export interface BridgeReport {
  id: string;
  tenantId?: string;
  connectorAId: string;
  connectorBId: string;
  inferredSchemaA: InferredJsonSchema;
  inferredSchemaB: InferredJsonSchema;
  diffs: FieldDiff[];
  mappings: FieldMapping[];
  resolvedConflicts: ResolvedConflict[];
  requirementsReport: RequirementsReport;
  /** Función TypeScript generada automáticamente para transformar A→B */
  generatedTransformTs: string;
  generatedAt: string;
}

// ─── Opciones de comparación ─────────────────────────────────────────────────

export interface CompareOptions {
  /** Umbral de similitud para detectar renombrados (default: 0.70) */
  renameSimilarityThreshold: number;
  /** Activar escalación al LLM para casos ambiguos */
  enableLlmEscalation: boolean;
  /** Máx de escalaciones LLM permitidas */
  maxLlmEscalations: number;
}

export interface SchemaInferrerConfig {
  businessTypeProviders?: BusinessTypeProvider[];
  maxExamples?: number;
}

export interface SimilarityEngineConfig {
  businessTypeWeights?: BusinessTypeWeightMap;
  ontologyProviders?: OntologyProvider[];
  decisionPolicy?: SimilarityDecisionPolicyConfig;
}

export interface ConflictResolverConfig {
  autoAcceptThreshold?: number;
  humanReviewThreshold?: number;
  minConfidenceMargin?: number;
  decisionPolicy?: SimilarityDecisionPolicyConfig;
}

// ─── Zod schemas para validación de request ──────────────────────────────────

export const CompareOptionsSchema = z.object({
  renameSimilarityThreshold: z.number().min(0).max(1).default(0.70),
  enableLlmEscalation: z.boolean().default(false),
  maxLlmEscalations: z.number().int().min(0).max(10).default(3),
});

export const CompareSchemasRequestSchema = z.object({
  connectorAId: z.string().min(1),
  connectorBId: z.string().min(1),
  /** Muestras de datos del Sistema A (JSON objects) */
  samplesA: z.array(z.record(z.unknown())).min(1).max(2000),
  /** Muestras de datos del Sistema B (JSON objects) */
  samplesB: z.array(z.record(z.unknown())).min(1).max(2000),
  tenantId: z.string().optional(),
  options: CompareOptionsSchema.optional(),
});

export type CompareSchemasRequest = z.infer<typeof CompareSchemasRequestSchema>;

// ─── Config del bridge ───────────────────────────────────────────────────────

export interface SchemaBridgeConfig {
  /** URL de Redis para pub/sub (opcional — si no hay Redis, solo callbacks locales) */
  redisUrl?: string;
  /** Canal Redis para notificaciones en tiempo real */
  realtimeChannel?: string;
  /** API key de Anthropic (solo necesaria si enableLlmEscalation=true) */
  anthropicApiKey?: string;
  /** Logger de @integrax/logger */
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  /** Business types inyectables para semántica específica de dominio. */
  businessTypeProviders?: BusinessTypeProvider[];
  /** Ontologías opcionales para alias y conocimiento semántico externo. */
  ontologyProviders?: OntologyProvider[];
  /** Pesos inyectables para tipos de negocio. */
  businessTypeWeights?: BusinessTypeWeightMap;
  /** Cantidad máxima de examples retenidos por campo para la señal estadística. */
  maxExamples?: number;
  mappingMemory?: MappingMemoryEntry[];
  /** Umbral mínimo de margen entre el mejor candidato y el segundo. */
  confidenceMarginThreshold?: number;
  /** Umbral absoluto de auto-aceptación para renombrados. */
  autoAcceptThreshold?: number;
  /** Umbral para escalar a revisión humana/LLM. */
  humanReviewThreshold?: number;
  decisionPolicy?: SimilarityDecisionPolicyConfig;
  /**
   * Ratio de rechazos para vetar un par de campos en la memoria (default: 0.70).
   * Si rejectedCount/total ≥ este valor y hay ≥ rejectionMinSamples, el par se excluye.
   */
  rejectionVetoRatio?: number;
  /**
   * Mínimo de muestras necesarias para activar el veto por rechazo (default: 3).
   */
  rejectionMinSamples?: number;
}

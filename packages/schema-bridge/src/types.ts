/**
 * @integrax/schema-bridge — Types
 *
 * All Zod schemas and TypeScript types for the schema comparison engine.
 */

import { z } from 'zod';

// ─── Inferred schema node ─────────────────────────────────────────────────────

export type JsonPrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface SchemaNode {
  /** JSON type. Array when mixed types are observed (e.g. ["string", "null"]). */
  type: JsonPrimitiveType | JsonPrimitiveType[];
  /** Semantic format (date, date-time, email, uuid, uri, ar-cuit, ar-money-string) */
  format?: string;
  /** Field was null in at least one sample */
  nullable: boolean;
  /** Muestras de ejemplo (máx 3) */
  /** Muestras de ejemplo retenidas para la señal estadística (configurable, default 200) */
  examples: unknown[];
  /** Child nodes when type === 'object' */
  children?: Record<string, SchemaNode>;
  /** Item schema when type === 'array' */
  itemSchema?: SchemaNode;
  /** Possible values when an enum is detected */
  enum?: unknown[];
  /** Calidad y cobertura observada de las muestras para este campo. */
  evidence?: FieldEvidence;
  /** Human-readable description from spec (OpenAPI/SQL) */
  description?: string;
  /** Identifica si el campo es Clave Primaria (SQL DDL) */
  primaryKey?: boolean;
}

export interface SchemaField {
  /** Dot-notation path, e.g. "order.customer.email" */
  path: string;
  /** true if the field appears in ≥80% of samples */
  required: boolean;
  node: SchemaNode;
}

export interface InferredJsonSchema {
  fields: SchemaField[];
  /** SHA-256 (32 chars) del esquema canonicalizado */
  fingerprint: string;
  /** Total number of samples processed */
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

/**
 * Los 5 canales de evidencia que contribuyen al score de similitud.
 * Se usa para trackear qué canal fue dominante en los mappings aceptados
 * y derivar multiplicadores adaptativos por par de conectores.
 */
export type SignalChannel = 'lexical' | 'value' | 'structural' | 'businessType' | 'ontology';

/**
 * Multiplicadores por canal de evidencia. Valores en [0.80, 1.20].
 * Un canal con multiplier > 1.0 recibe más peso en el scoring;
 * un canal con multiplier < 1.0 recibe menos peso.
 * Se derivan desde el historial de feedback via `computeSignalWeights`.
 */
export type ChannelMultipliers = Record<SignalChannel, number>;

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
  /**
   * Conteo de veces que cada canal fue el dominante en un mapping aceptado.
   * Alimenta `computeSignalWeights` para derivar multiplicadores adaptativos.
   * Solo se incrementa en aceptaciones con evidenceBreakdown disponible.
   */
  channelHits?: Partial<Record<SignalChannel, number>>;
  /** 
   * Si es true, el motor ignora los umbrales mínimos de muestras/counts 
   * para activar este mapping (autoridad absoluta del seed/Ground Truth).
   */
  isGroundTruth?: boolean;
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
  /** Regla que disparó la decisión — para auditoría y explainability. */
  matchRule?: SimilarityMatchRule;
  evidenceQuality?: number;
  evidenceBreakdown?: SimilarityEvidenceBreakdown;
}

export type SimilarityDecision = 'auto_accept' | 'review' | 'reject';

/**
 * Identifica cuál regla del SimilarityDecisionPolicy disparó la decisión.
 * Permite auditar por qué el engine aceptó, envió a review, o rechazó un par de campos.
 */
export type SimilarityMatchRule =
  | 'rule0_memory'       // Memoria histórica de operadores (feedback loop)
  | 'rule1_golden'       // Score alto + multi-canal + margen suficiente
  | 'rule2_value'        // Dominancia de valor (campos con nombres opacos)
  | 'rule3_margin'       // Ganador inequívoco (margen muy alto)
  | 'rule4_semantic'     // Ancla de ontología/tipo de negocio
  | 'rule5_review'       // Score aceptable, va a revisión humana/LLM
  | 'reject';            // Debajo de todos los umbrales

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
  /** 0.0–1.0, where 1.0 is a critical breaking change */
  breakingScore: number;
  /** Only populated for rename_candidate */
  similarity?: SimilarityScore;
}

export interface SchemaDiff {
  diffs: FieldDiff[];
  schemaA: InferredJsonSchema;
  schemaB: InferredJsonSchema;
  generatedAt: string;
}

// ─── Type compatibility ───────────────────────────────────────────────────────

export type TypeCompatibility =
  | 'identical'
  | 'widening'
  | 'narrowing'
  | 'coercible'
  | 'incompatible';

export interface TypeResolution {
  compatibility: TypeCompatibility;
  /** Safe JS expression (no eval), e.g. "Number(v)" */
  coercionFn: string | null;
  requiresValidation: boolean;
  lossOfPrecision: boolean;
  description: string;
}

// ─── Conflict resolution ──────────────────────────────────────────────────────

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
  /** Safe JS coercion expression */
  coercionFn?: string;
  /** Constant value for new fields with no counterpart in A */
  constant?: unknown;
  description: string;
  /**
   * Para kind='split': los campos destino derivados del campo fuente.
   * Ejemplo: full_name → ['first_name', 'last_name']
   */
  toPaths?: string[];
  /** Estrategia de split: 'space' (primera palabra / resto) | 'regex' */
  splitStrategy?: 'space' | 'regex';
  /** Regex literal (sin delimitadores) para splitStrategy='regex' */
  splitRegex?: string;
  /**
   * Para kind='merge': los campos fuente que se combinan en un campo destino.
   * Ejemplo: ['amount', 'currency'] → money
   */
  fromPaths?: string[];
  /** Estrategia de merge: 'object' (objeto con keys) | 'concat' (string unido) */
  mergeStrategy?: 'object' | 'concat';
  /** Separador para mergeStrategy='concat'. Default: ' ' */
  mergeSeparator?: string;
}

/**
 * Explicación estructurada de por qué el engine tomó una decisión de mapping.
 * Expone los scores de cada canal de evidencia + la regla que disparó el resultado.
 * Clave para auditoría enterprise y para que los operadores entiendan el razonamiento.
 */
export interface MatchExplanation {
  /** Regla que disparó la decisión final. */
  rule: SimilarityMatchRule;
  /** Score de similitud de nombre (lexical + semántico). */
  nameScore: number;
  /** Score de overlap de valores observados. */
  valueScore: number;
  /** Score de similitud estructural/path. */
  structuralScore: number;
  /** Score de conocimiento semántico (ontología + tipo de negocio). */
  semanticScore: number;
  /** true si la decisión fue influenciada por memoria histórica de operadores. */
  memoryBased: boolean;
  /** true si la memoria aún no tiene suficientes feedbacks para autoridad total (provisional). */
  memoryProvisional?: boolean;
  /** Margen de ventaja sobre el segundo candidato (fuente→destino). */
  margin: number;
}

export interface FieldMapping {
  id: string;
  pathA: string | null;
  pathB: string | null;
  transform: TransformSpec;
  confidence: number;
  bidirectional: boolean;
  /** Inverse expression for B→A */
  inverseCoercionFn?: string;
  /**
   * Razón de la decisión de mapping — útil para observabilidad y auditoría.
   * Valores posibles:
   *   'deterministic:field_added'     — campo nuevo en B, sin contraparte en A
   *   'deterministic:rename'          — renombrado con alta confianza (auto-aceptado)
   *   'deterministic:type_widening'   — cambio de tipo compatible (widening/coercible)
   *   'deterministic:nullability'     — cambio de obligatoriedad
   *   'heuristic:money_coerce'        — campo monetario con coerción de tipo
   *   'heuristic:constraint_changed'  — cambio de enum/restricciones
   *   'heuristic:rename_review'       — renombrado con confianza media (requiere revisión)
   */
  decisionReason?: string;
  /**
   * Explicación estructurada de por qué se tomó esta decisión.
   * Presente solo en rename_candidates — los campos determinísticos no necesitan justificación.
   */
  why?: MatchExplanation;
}

export interface ResolvedConflict {
  diff: FieldDiff;
  resolution: ConflictClass;
  mapping: FieldMapping | null;
  confidence: number;
  llmRequired: boolean;
  /** Human-readable reason why this conflict needs LLM escalation */
  llmReason?: string;
}

// ─── Functional requirements report ──────────────────────────────────────────

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
  /** Prompt seed for the operator or the LLM */
  promptSeed: string;
}

export interface RequirementsReport {
  /** Changes that break the existing integration */
  breaking: FunctionalRequirement[];
  /** Changes that do not break but require updates */
  nonBreaking: FunctionalRequirement[];
  /** Informational only — no code change required */
  informational: FunctionalRequirement[];
  /** Conflicts requiring manual review or LLM escalation */
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

// ─── Client notification ──────────────────────────────────────────────────────

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

// ─── Full bridge report (main output) ────────────────────────────────────────

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
  /** Mappings compuestos detectados (split / merge). Complementan, no reemplazan, los mappings 1:1. */
  compositeMappings?: CompositeMapping[];
  requirementsReport: RequirementsReport;
  /** Auto-generated TypeScript function to transform A→B */
  generatedTransformTs: string;
  generatedAt: string;
  /**
   * true cuando se detecta drift significativo respecto al baseline de confianza.
   * Señal de que el schema o la distribución de valores cambió desde la última comparación.
   */
  driftDetected?: boolean;
  /** Detalle del drift detectado (si driftDetected=true). */
  driftDetail?: DriftDetail;
  /**
   * Impact assessment with per-diff remediation hints and routing recommendations.
   * Populated after compare() — tells callers not just *what* changed but *what to do*.
   */
  impactAssessment?: import('./impact-scorer.js').ImpactAssessment;
}

// ─── Composite mappings ──────────────────────────────────────────────────────

export type CompositeMappingKind = 'split' | 'merge';

/**
 * Describe un mapping compuesto (1:N o N:1) detectado heurísticamente.
 * No es auto-aceptado — va a revisión del operador.
 */
export interface CompositeMapping {
  kind: CompositeMappingKind;
  /** Campo(s) origen */
  fromPaths: string[];
  /** Campo(s) destino */
  toPaths: string[];
  transform: TransformSpec;
  /** Confianza heurística de la detección (0–1) */
  confidence: number;
  /** Explicación en lenguaje natural */
  reason: string;
}

// ─── Drift detection ─────────────────────────────────────────────────────────

export interface DriftDetail {
  /** Confianza promedio actual de los mappings auto-aceptados */
  currentAvgConfidence: number;
  /** Baseline de confianza promedio (de la memoria histórica) */
  baselineAvgConfidence: number;
  /** Caída absoluta de confianza */
  confidenceDrop: number;
  /** Número de campos en A que no tienen contraparte en B (campo huérfano) */
  unmatchedFieldsA: number;
  /** Número de campos en B que no tienen contraparte en A */
  unmatchedFieldsB: number;
  /** Lista de campos que cambiaron de tipo */
  typeChanges: string[];
}

// ─── Compare options ──────────────────────────────────────────────────────────

export interface CompareOptions {
  /** Umbral de similitud para detectar renombrados (default: 0.70) */
  renameSimilarityThreshold?: number;
  /** Activar escalación al LLM para casos ambiguos */
  enableLlmEscalation?: boolean;
  /** Máx de escalaciones LLM permitidas */
  maxLlmEscalations?: number;
}

export interface SchemaInferrerConfig {
  businessTypeProviders?: BusinessTypeProvider[];
  maxExamples?: number;
  /** Maximum object/array nesting depth to traverse (default: 20). Guards against malicious payloads. */
  maxDepth?: number;
}

export interface SimilarityEngineConfig {
  businessTypeWeights?: BusinessTypeWeightMap;
  ontologyProviders?: OntologyProvider[];
  decisionPolicy?: SimilarityDecisionPolicyConfig;
  /**
   * Multiplicadores por canal de evidencia derivados del historial de feedback.
   * Amplifica canales históricamente confiables y reduce los poco informativos.
   * Generado por `computeSignalWeights(entries, connectorAId, connectorBId)`.
   * Si no se provee, todos los canales tienen peso 1.0 (comportamiento actual).
   */
  channelMultipliers?: ChannelMultipliers;
}

export interface ConflictResolverConfig {
  autoAcceptThreshold?: number;
  humanReviewThreshold?: number;
  minConfidenceMargin?: number;
  decisionPolicy?: SimilarityDecisionPolicyConfig;
}

// ─── Zod request schemas ──────────────────────────────────────────────────────

export const CompareOptionsSchema = z.object({
  renameSimilarityThreshold: z.number().min(0).max(1).default(0.70),
  enableLlmEscalation: z.boolean().default(false),
  maxLlmEscalations: z.number().int().min(0).max(10).default(3),
});

export const CompareSchemasRequestSchema = z.object({
  connectorAId: z.string().min(1),
  connectorBId: z.string().min(1),
  /** Muestras de datos del Sistema A (JSON objects) */
  samplesA: z.array(z.record(z.unknown())).max(2000).optional(),
  /** Muestras de datos del Sistema B (JSON objects) */
  samplesB: z.array(z.record(z.unknown())).max(2000).optional(),
  
  /** Schema explícito (bypassa la inferencia desde samples) */
  schemaA: z.custom<InferredJsonSchema>().optional(),
  schemaB: z.custom<InferredJsonSchema>().optional(),

  tenantId: z.string().optional(),
  options: CompareOptionsSchema.optional(),
  mappingMemory: z.array(z.custom<MappingMemoryEntry>()).optional(),
}).refine(
  data => (data.samplesA != null || data.schemaA != null) && (data.samplesB != null || data.schemaB != null),
  { message: "Must provide either 'samples' or 'schema' for both sides." }
);

export type CompareSchemasRequest = z.infer<typeof CompareSchemasRequestSchema>;

// ─── Bridge config ────────────────────────────────────────────────────────────

export interface SchemaBridgeConfig {
  /** Redis URL for pub/sub (optional — degrades to local callbacks if absent) */
  redisUrl?: string;
  /** Redis channel for real-time notifications */
  realtimeChannel?: string;
  /** Anthropic API key (only required when enableLlmEscalation=true) */
  anthropicApiKey?: string;
  /** Logger compatible with @integrax/logger */
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
  /**
   * Mínimo de aceptaciones explícitas para que la memoria tenga autoridad de auto-accept (default: 3).
   * Por debajo de este umbral el score de memoria se recorta a ≤ 0.82 para no disparar la Regla 0.
   */
  minFeedbackForAutoAccept?: number;
}

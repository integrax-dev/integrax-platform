/**
 * @integrax/schema-bridge
 *
 * Motor de comparación de schemas entre dos sistemas.
 * Detecta cambios de estructura y tipos de datos, resuelve conflictos
 * determinísticamente (sin consumir tokens LLM) y genera transformaciones
 * TypeScript listas para usar.
 *
 * Uso básico:
 * ```ts
 * import { createSchemaBridge } from '@integrax/schema-bridge';
 *
 * const bridge = createSchemaBridge({ redisUrl: process.env.REDIS_URL });
 * const report = await bridge.compare({
 *   connectorAId: 'mercadopago',
 *   connectorBId: 'contabilium',
 *   samplesA: [{ id: 123, monto: '1500.50', estado: 'approved' }],
 *   samplesB: [{ payment_id: 'PAY-001', amount: 1500.50, status: 'paid' }],
 * });
 * ```
 */

export { SchemaBridge, createSchemaBridge } from './bridge.js';
export { assessImpact } from './impact-scorer.js';
export type { ImpactAssessment, ImpactLabel, RemediationHint, RoutingTarget } from './impact-scorer.js';
export {
  defaultBusinessTypeProviders,
  defaultBusinessTypeWeights,
  detectBusinessFormat,
} from './business-type-registry.js';
export { defaultOntologyProviders } from './ontology-registry.js';
export {
  createMappingMemoryOntologyProvider,
  updateMemoryEntry,
  computeSignalWeights,
  computeDecayFactor,
  DEFAULT_CHANNEL_MULTIPLIERS,
  MIN_HITS_FOR_CHANNEL_WEIGHTS,
  DECAY_HALF_LIFE_DAYS,
} from './mapping-memory-provider.js';
export { detectCompositeMappings } from './composite-mapper.js';
export { detectDrift } from './drift-detector.js';
export { SqlDdlAdapter } from './adapters/sql-adapter.js';
export { OpenApiAdapter } from './adapters/openapi-adapter.js';
export type { SchemaAdapter } from './adapters/sql-adapter.js';

export { AvroSchemaAdapter, createAvroSchemaAdapter } from './adapters/avro-adapter.js';
export { SchemaInferrer, createSchemaInferrer } from './schema-inferrer.js';
export { SchemaDiffer, createSchemaDiffer } from './schema-differ.js';
export { SimilarityEngine, createSimilarityEngine, normalizeName } from './similarity-engine.js';
export { SimilarityDecisionPolicy, createSimilarityDecisionPolicy } from './similarity-decision-policy.js';
export { ConflictResolver, createConflictResolver } from './conflict-resolver.js';
export { buildExplanation, formatExplanation } from './explain.js';
export { MappingGenerator, createMappingGenerator } from './mapping-generator.js';
export { ChangeReporter, createChangeReporter } from './change-reporter.js';
export { ClientUpdater, createClientUpdater } from './client-updater.js';
export { TypeResolver, createTypeResolver } from './type-resolver.js';

export type {
  // Schemas inferidos
  InferredJsonSchema,
  SchemaField,
  SchemaNode,
  JsonPrimitiveType,
  // Diff
  SchemaDiff,
  FieldDiff,
  DiffKind,
  SimilarityScore,
  // Tipos
  TypeCompatibility,
  TypeResolution,
  // Conflictos
  ConflictClass,
  ResolvedConflict,
  TransformKind,
  TransformSpec,
  FieldMapping,
  // Reporte
  RequirementsReport,
  FunctionalRequirement,
  RequirementPriority,
  RequirementCategory,
  EffortEstimate,
  LLMEscalation,
  // Notificaciones
  ClientUpdateNotification,
  ChangeSeverity,
  // Principal
  BridgeReport,
  CompareSchemasRequest,
  CompareOptions,
  BusinessTypeDetectionContext,
  BusinessTypeProvider,
  BusinessTypeWeightMap,
  FieldEvidence,
  MappingMemoryEntry,
  OntologyMatch,
  OntologyMatchContext,
  OntologyProvider,
  ConflictResolverConfig,
  SchemaInferrerConfig,
  SimilarityDecision,
  SimilarityDecisionPolicyConfig,
  SimilarityEvidenceBreakdown,
  SimilarityEngineConfig,
  SchemaBridgeConfig,
  SimilarityMatchRule,
  MatchExplanation,
  SignalChannel,
  ChannelMultipliers,
  CompositeMapping,
  CompositeMappingKind,
  DriftDetail,
} from './types.js';

export { CompareSchemasRequestSchema, CompareOptionsSchema } from './types.js';

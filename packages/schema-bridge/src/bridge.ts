/**
 * SchemaBridge — Facade principal
 *
 * Orquesta el pipeline completo:
 *   1. Inferir esquemas de las muestras
 *   2. Diff estructural
 *   3. Detección de renombrados (similitud)
 *   4. Resolución de conflictos (determinístico → heurístico → LLM)
 *   5. Generación de mappings y código TypeScript
 *   6. Reporte de requerimientos funcionales
 *   7. Notificación a clientes (fire-and-forget)
 */

import { ulid } from 'ulid';
import type {
  BridgeReport,
  CompareSchemasRequest,
  FieldDiff,
  MappingMemoryEntry,
  SchemaBridgeConfig,
} from './types.js';
import { SchemaInferrer } from './schema-inferrer.js';
import { SchemaDiffer } from './schema-differ.js';
import { SimilarityEngine } from './similarity-engine.js';
import { ConflictResolver } from './conflict-resolver.js';
import { MappingGenerator } from './mapping-generator.js';
import { ChangeReporter } from './change-reporter.js';
import { ClientUpdater } from './client-updater.js';
import { createMappingMemoryOntologyProvider, updateMemoryEntry } from './mapping-memory-provider.js';
import { runLlmEscalations } from './llm-escalation.js';
import type { OntologyProvider } from './types.js';

export class SchemaBridge {
  private readonly inferrer: SchemaInferrer;
  private readonly differ: SchemaDiffer;
  private readonly resolver: ConflictResolver;
  private readonly mapper: MappingGenerator;
  private readonly reporter: ChangeReporter;
  private readonly updater: ClientUpdater;
  private readonly logger: Required<SchemaBridgeConfig>['logger'];
  private memoryEntries: MappingMemoryEntry[];
  // Stored for per-compare SimilarityEngine creation with connector-scoped memory.
  private readonly baseOntologyProviders: OntologyProvider[];
  private readonly similarityConfig: Pick<SchemaBridgeConfig, 'businessTypeWeights' | 'decisionPolicy'>;
  private readonly memoryVetoRatio: number | undefined;
  private readonly memoryMinSamples: number | undefined;
  private readonly anthropicApiKey: string | undefined;

  constructor(config: SchemaBridgeConfig = {}) {
    this.memoryEntries = [...(config.mappingMemory ?? [])];
    this.baseOntologyProviders = config.ontologyProviders ?? [];
    this.similarityConfig = {
      businessTypeWeights: config.businessTypeWeights,
      decisionPolicy: config.decisionPolicy,
    };
    this.memoryVetoRatio = config.rejectionVetoRatio;
    this.memoryMinSamples = config.rejectionMinSamples;
    this.anthropicApiKey = config.anthropicApiKey;

    this.inferrer = new SchemaInferrer({
      businessTypeProviders: config.businessTypeProviders,
      maxExamples: config.maxExamples,
    });
    this.differ = new SchemaDiffer();
    this.resolver = new ConflictResolver({
      autoAcceptThreshold: config.autoAcceptThreshold,
      humanReviewThreshold: config.humanReviewThreshold,
      minConfidenceMargin: config.confidenceMarginThreshold,
      decisionPolicy: config.decisionPolicy,
    });
    this.mapper = new MappingGenerator();
    this.reporter = new ChangeReporter();
    this.updater = new ClientUpdater({
      redisUrl: config.redisUrl,
      realtimeChannel: config.realtimeChannel,
      logger: config.logger,
    });
    this.logger = config.logger ?? {
      info: (...a) => console.info('[schema-bridge]', ...a),
      warn: (...a) => console.warn('[schema-bridge]', ...a),
      error: (...a) => console.error('[schema-bridge]', ...a),
    };
  }

  /**
   * Punto de entrada principal. Compara dos sistemas y devuelve el BridgeReport completo.
   *
   * La mayor parte del trabajo es determinística y O(n*m) donde n=muestras, m=campos.
   * Solo los casos 'ambiguous' escalados al LLM consumen tokens.
   */
  async compare(request: CompareSchemasRequest): Promise<BridgeReport> {
    const id = `br_${ulid()}`;
    const startMs = Date.now();
    const options = {
      renameSimilarityThreshold: request.options?.renameSimilarityThreshold ?? 0.80,
      enableLlmEscalation: request.options?.enableLlmEscalation ?? false,
      maxLlmEscalations: request.options?.maxLlmEscalations ?? 3,
    };

    this.logger.info({
      id,
      connectorA: request.connectorAId,
      connectorB: request.connectorBId,
      samplesA: request.samplesA.length,
      samplesB: request.samplesB.length,
    }, 'Iniciando comparación de schemas');

    // ── 1. Inferir schemas ─────────────────────────────────────────────────────
    const schemaA = this.inferrer.infer(request.samplesA);
    const schemaB = this.inferrer.infer(request.samplesB);

    this.logger.info({
      fieldsA: schemaA.fields.length,
      fieldsB: schemaB.fields.length,
      fingerprintA: schemaA.fingerprint,
      fingerprintB: schemaB.fingerprint,
    }, 'Schemas inferidos');

    // Optimización: si los fingerprints son idénticos → sin diferencias
    if (schemaA.fingerprint === schemaB.fingerprint) {
      this.logger.info({ id }, 'Fingerprints idénticos — sin diferencias');
      return this.buildEmptyReport(id, request, schemaA, schemaB);
    }

    // ── 2. Diff estructural ────────────────────────────────────────────────────
    const rawDiffs = this.differ.diff(schemaA, schemaB);

    // ── 3. Detectar renombrados ────────────────────────────────────────────────
    // Build a connector-scoped SimilarityEngine for this compare call.
    // Global entries (no connector scope) always apply; connector-specific entries
    // only apply when their connector pair matches the current request.
    const scopedMemory = this.memoryEntries.filter(e =>
      (!e.connectorAId && !e.connectorBId) ||
      (e.connectorAId === request.connectorAId && e.connectorBId === request.connectorBId),
    );
    const memoryProviders: OntologyProvider[] = scopedMemory.length > 0
      ? [createMappingMemoryOntologyProvider(scopedMemory, {
          rejectionVetoRatio: this.memoryVetoRatio,
          rejectionMinSamples: this.memoryMinSamples,
        })]
      : [];
    const similarity = new SimilarityEngine({
      ...this.similarityConfig,
      ontologyProviders: [...this.baseOntologyProviders, ...memoryProviders],
    });

    const removed = rawDiffs.filter(d => d.kind === 'field_removed');
    const added = rawDiffs.filter(d => d.kind === 'field_added');
    const renameCandidates = similarity.findRenameCandidates(
      removed, added, options.renameSimilarityThreshold,
    );

    // Reemplazar los field_removed/field_added que forman un par rename
    const mergedDiffs = this.mergeRenames(rawDiffs, renameCandidates);

    this.logger.info({
      totalDiffs: mergedDiffs.length,
      renameCandidates: renameCandidates.length,
    }, 'Diff completado');

    // ── 4. Resolver conflictos ─────────────────────────────────────────────────
    let resolvedConflicts = this.resolver.resolveAll(mergedDiffs, options);

    // ── 4b. LLM escalation para pares ambiguos (opcional, off by default) ──────
    if (options.enableLlmEscalation && this.anthropicApiKey) {
      resolvedConflicts = await runLlmEscalations(
        resolvedConflicts,
        this.anthropicApiKey,
        options.maxLlmEscalations,
        this.logger,
      );
    }

    // ── 5. Generar mappings y código TypeScript ────────────────────────────────
    const mappings = this.mapper.generate(resolvedConflicts);

    for (const m of mappings) {
      if (m.pathA || m.pathB) {
        this.logger.info({
          pathA: m.pathA,
          pathB: m.pathB,
          confidence: m.confidence,
          decisionReason: m.decisionReason,
        }, 'Field mapping decision');
      }
    }

    const generatedTransformTs = this.mapper.generateTypeScript(
      mappings, request.connectorAId, request.connectorBId,
    );

    // ── 6. Reporte de requerimientos ──────────────────────────────────────────
    const requirementsReport = this.reporter.buildReport(resolvedConflicts, mappings);

    const report: BridgeReport = {
      id,
      tenantId: request.tenantId,
      connectorAId: request.connectorAId,
      connectorBId: request.connectorBId,
      inferredSchemaA: schemaA,
      inferredSchemaB: schemaB,
      diffs: mergedDiffs,
      mappings,
      resolvedConflicts,
      requirementsReport,
      generatedTransformTs,
      generatedAt: new Date().toISOString(),
    };

    this.logger.info({
      id,
      durationMs: Date.now() - startMs,
      breaking: requirementsReport.summary.breakingCount,
      nonBreaking: requirementsReport.summary.nonBreakingCount,
      coverage: requirementsReport.summary.coveragePercent,
    }, 'Comparación completada');

    // ── 7. Notificar clientes (fire-and-forget) ────────────────────────────────
    this.updater.notifySchemaChange(report).catch(err =>
      this.logger.warn({ err }, 'Error en notificación de clientes (no fatal)')
    );

    return report;
  }

  /**
   * Genera el Markdown del reporte para un BridgeReport existente.
   */
  /**
   * Registra el feedback del operador sobre un par de campos.
   * Actualiza la memoria interna. Llamar a `getMemorySnapshot()` para obtener
   * el estado actualizado y persistirlo.
   */
  recordFeedback(
    pathA: string,
    pathB: string,
    accepted: boolean,
    confidence: number,
    connectorAId?: string,
    connectorBId?: string,
  ): void {
    this.memoryEntries = updateMemoryEntry(
      this.memoryEntries, pathA, pathB, accepted, confidence, connectorAId, connectorBId,
    );
  }

  /** Devuelve una copia del estado actual de la memoria para persistencia externa. */
  getMemorySnapshot(): MappingMemoryEntry[] {
    return [...this.memoryEntries];
  }

  toMarkdown(report: BridgeReport): string {
    return this.reporter.toMarkdown(
      report.requirementsReport,
      report.connectorAId,
      report.connectorBId,
    );
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private mergeRenames(diffs: FieldDiff[], candidates: FieldDiff[]): FieldDiff[] {
    if (candidates.length === 0) return diffs;

    const renamedA = new Set(candidates.map(c => c.pathA!));
    const renamedB = new Set(candidates.map(c => c.pathB!));

    const filtered = diffs.filter(d => {
      if (d.kind === 'field_removed' && d.pathA && renamedA.has(d.pathA)) return false;
      if (d.kind === 'field_added' && d.pathB && renamedB.has(d.pathB)) return false;
      return true;
    });

    // Insertar candidates en orden de breakingScore
    return [...filtered, ...candidates].sort((a, b) => b.breakingScore - a.breakingScore);
  }

  private buildEmptyReport(
    id: string,
    request: CompareSchemasRequest,
    schemaA: ReturnType<SchemaInferrer['infer']>,
    schemaB: ReturnType<SchemaInferrer['infer']>,
  ): BridgeReport {
    const emptyReport = this.reporter.buildReport([], []);
    return {
      id,
      tenantId: request.tenantId,
      connectorAId: request.connectorAId,
      connectorBId: request.connectorBId,
      inferredSchemaA: schemaA,
      inferredSchemaB: schemaB,
      diffs: [],
      mappings: [],
      resolvedConflicts: [],
      requirementsReport: emptyReport,
      generatedTransformTs: `// Sistemas A y B tienen schemas idénticos — sin transformación necesaria\nexport function transformAToB(input: Record<string, unknown>): Record<string, unknown> { return { ...input }; }`,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function createSchemaBridge(config: SchemaBridgeConfig = {}): SchemaBridge {
  return new SchemaBridge(config);
}

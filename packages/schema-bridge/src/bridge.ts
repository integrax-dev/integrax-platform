/**
 * SchemaBridge — Main facade
 *
 * Orchestrates the full pipeline:
 *   1. Infer schemas from data samples
 *   2. Structural diff
 *   3. Rename detection (similarity)
 *   4. Conflict resolution (deterministic → heuristic → LLM)
 *   5. Mapping and TypeScript code generation
 *   6. Functional requirements report
 *   7. Client notification (fire-and-forget)
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
import { createMappingMemoryOntologyProvider, updateMemoryEntry, computeSignalWeights } from './mapping-memory-provider.js';
import { runLlmEscalations } from './llm-escalation.js';
import { detectCompositeMappings } from './composite-mapper.js';
import { detectDrift } from './drift-detector.js';
import type { OntologyProvider, SchemaField } from './types.js';
import type { SchemaAdapter } from './adapters/sql-adapter.js';
import { assessImpact } from './impact-scorer.js';

export class SchemaBridge {
  private readonly inferrer: SchemaInferrer;
  private readonly differ: SchemaDiffer;
  private readonly resolver: ConflictResolver;
  private readonly mapper: MappingGenerator;
  private readonly reporter: ChangeReporter;
  private readonly updater: ClientUpdater;
  private readonly logger: Required<SchemaBridgeConfig>['logger'];
  private memoryEntries: MappingMemoryEntry[];
  // Guardado para crear SimilarityEngine por llamada a compare() con memoria scoped al conector.
  private readonly baseOntologyProviders: OntologyProvider[];
  private readonly similarityConfig: Pick<SchemaBridgeConfig, 'businessTypeWeights' | 'decisionPolicy'>;
  private readonly memoryVetoRatio: number | undefined;
  private readonly memoryMinSamples: number | undefined;
  private readonly anthropicApiKey: string | undefined;
  private readonly explicitAutoAcceptThreshold: number | undefined;

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
    this.explicitAutoAcceptThreshold =
      config.decisionPolicy?.autoAcceptThreshold ?? config.autoAcceptThreshold;

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
   * Main entry point. Compares two systems and returns the full BridgeReport.
   *
   * Most work is deterministic O(n*m) where n=samples, m=fields.
   * Only 'ambiguous' conflicts escalated to LLM consume tokens.
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
      samplesA: request.samplesA?.length ?? 0,
      samplesB: request.samplesB?.length ?? 0,
    }, 'Iniciando comparación de schemas');

    // ── 1. Inferir schemas ─────────────────────────────────────────────────────
    const schemaA = request.schemaA ?? this.inferrer.infer(request.samplesA ?? []);
    const schemaB = request.schemaB ?? this.inferrer.infer(request.samplesB ?? []);

    this.logger.info({
      fieldsA: schemaA.fields.length,
      fieldsB: schemaB.fields.length,
      fingerprintA: schemaA.fingerprint,
      fingerprintB: schemaB.fingerprint,
    }, 'Schemas inferred');

    // Early exit: identical fingerprints mean no differences
    if (schemaA.fingerprint === schemaB.fingerprint) {
      this.logger.info({ id }, 'Identical fingerprints — no differences');
      return this.buildEmptyReport(id, request, schemaA, schemaB);
    }

    // ── 2. Structural diff ────────────────────────────────────────────────────
    const rawDiffs = this.differ.diff(schemaA, schemaB);

    // ── 3. Detectar renombrados ────────────────────────────────────────────────
    // Construir un SimilarityEngine con scope de conector para esta llamada a compare().
    // Las entradas globales (sin scope de conector) siempre aplican; las específicas
    // solo aplican cuando el par de conectores coincide con la solicitud actual.
    const combinedMemory = [...this.memoryEntries, ...(request.mappingMemory ?? [])];
    const scopedMemory = combinedMemory.filter(e =>
      (!e.connectorAId && !e.connectorBId) ||
      (e.connectorAId === request.connectorAId && e.connectorBId === request.connectorBId),
    );
    const memoryProviders: OntologyProvider[] = scopedMemory.length > 0
      ? [createMappingMemoryOntologyProvider(scopedMemory, {
          rejectionVetoRatio: this.memoryVetoRatio,
          rejectionMinSamples: this.memoryMinSamples,
        })]
      : [];
    const channelMultipliers = computeSignalWeights(
      scopedMemory,
      request.connectorAId,
      request.connectorBId,
    );

    const similarity = new SimilarityEngine({
      ...this.similarityConfig,
      channelMultipliers,
      decisionPolicy: {
        ...(this.similarityConfig.decisionPolicy ?? {}),
        autoAcceptThreshold:
          this.explicitAutoAcceptThreshold ??
          Math.max(0.95, options.renameSimilarityThreshold + 0.15),
        reviewThreshold: options.renameSimilarityThreshold,
      },
      ontologyProviders: [...this.baseOntologyProviders, ...memoryProviders],
    });

    const removed = rawDiffs.filter(d => d.kind === 'field_removed');
    const added = rawDiffs.filter(d => d.kind === 'field_added');
    const renameCandidates = similarity.findRenameCandidates(
      removed, added, options.renameSimilarityThreshold,
    );

    // Replace paired field_removed/field_added entries with rename_candidate
    const mergedDiffs = this.mergeRenames(rawDiffs, renameCandidates);

    this.logger.info({
      totalDiffs: mergedDiffs.length,
      renameCandidates: renameCandidates.length,
    }, 'Diff complete');

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

    // ── 4c. Mappings compuestos — split / merge sobre huérfanos restantes ────────
    const renamedAPaths = new Set(renameCandidates.map(c => c.pathA!).filter(Boolean));
    const renamedBPaths = new Set(renameCandidates.map(c => c.pathB!).filter(Boolean));
    const orphanRemoved = removed.filter(d => d.pathA && !renamedAPaths.has(d.pathA));
    const orphanAdded = added.filter(d => d.pathB && !renamedBPaths.has(d.pathB));
    const compositeMappings = detectCompositeMappings(orphanRemoved, orphanAdded);

    // ── 5. Mapping and TypeScript generation ──────────────────────────────────
    const mappings = this.mapper.generate(resolvedConflicts);

    // Convierto los mappings compuestos a FieldMappings para inyectar su lógica en el AST de TS
    for (const comp of compositeMappings) {
      if (comp.kind === 'split') {
        const primaryDest = comp.toPaths[0];
        mappings.push({
          id: `comp_${Date.now()}_split_${comp.fromPaths[0]}`,
          pathA: comp.fromPaths[0],
          pathB: primaryDest,
          transform: comp.transform,
          confidence: comp.confidence,
          bidirectional: false,
          decisionReason: `heuristic:split`,
        });
      } else if (comp.kind === 'merge') {
        const primarySource = comp.fromPaths[0];
        mappings.push({
          id: `comp_${Date.now()}_merge_${comp.toPaths[0]}`,
          pathA: primarySource,
          pathB: comp.toPaths[0],
          transform: comp.transform,
          confidence: comp.confidence,
          bidirectional: false,
          decisionReason: `heuristic:merge`,
        });
      }
    }

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

    // ── 6. Requirements report ────────────────────────────────────────────────
    const requirementsReport = this.reporter.buildReport(resolvedConflicts, mappings);

    // ── 6b. Drift detection ───────────────────────────────────────────────────
    const typeChangedPaths = mergedDiffs
      .filter(d => d.kind === 'type_changed')
      .map(d => d.pathA ?? d.pathB ?? '')
      .filter(Boolean);
    const driftDetail = detectDrift(
      mappings,
      scopedMemory,
      orphanRemoved.length,
      orphanAdded.length,
      typeChangedPaths,
    );

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
      ...(compositeMappings.length > 0 ? { compositeMappings } : {}),
      requirementsReport,
      generatedTransformTs,
      ...(driftDetail ? { driftDetected: true, driftDetail } : {}),
      generatedAt: new Date().toISOString(),
    };

    // ── 8. Impact assessment + remediation hints ──────────────────────────────
    report.impactAssessment = assessImpact(report);

    this.logger.info({
      id,
      durationMs: Date.now() - startMs,
      breaking: requirementsReport.summary.breakingCount,
      nonBreaking: requirementsReport.summary.nonBreakingCount,
      coverage: requirementsReport.summary.coveragePercent,
    }, 'Comparison complete');

    // ── 7. Notify clients (fire-and-forget) ───────────────────────────────────
    this.updater.notifySchemaChange(report).catch(err =>
      this.logger.warn({ err }, 'Client notification failed (non-fatal)')
    );

    return report;
  }

  /**
   * Seeds the internal Mapping Memory from a schema adapter.
   * Useful for training the engine with official specs (OpenAPI, SQL DDL, etc.)
   * before live traffic arrives.
   * antes de que llegue el tráfico real.
   */
  async seed(
    adapter: SchemaAdapter, 
    connectorAId?: string, 
    connectorBId?: string,
    customMappings?: Record<string, string>
  ): Promise<number> {
    const inferred = adapter.adapt();
    let count = 0;

    for (const field of inferred.fields) {
      const targetPath = customMappings?.[field.path] ?? field.path;
      // In a seed, we record identity or custom mapping as Ground Truth
      this.memoryEntries = updateMemoryEntry(
        this.memoryEntries,
        field.path,
        targetPath,
        true,
        1.0,
        connectorAId,
        connectorBId
      );
      
      // Mark precisely the last updated/created entry as Ground Truth
      const lastEntry = this.memoryEntries.find(e => 
        e.sourcePath === field.path && 
        e.targetPath === targetPath && 
        e.connectorAId === connectorAId && 
        e.connectorBId === connectorBId
      );
      if (lastEntry) lastEntry.isGroundTruth = true;
      count++;
    }

    this.logger.info({ 
      fieldCount: count, 
      connectorAId, 
      connectorBId 
    }, 'Bridge memory seeded from adapter');
    
    return count;
  }

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
    breakdown?: import('./types.js').SimilarityEvidenceBreakdown,
  ): void {
    this.memoryEntries = updateMemoryEntry(
      this.memoryEntries, pathA, pathB, accepted, confidence, connectorAId, connectorBId, breakdown,
    );
  }

  /** Devuelve una copia del estado actual de la memoria para persistencia externa. */
  getMemorySnapshot(): MappingMemoryEntry[] {
    return [...this.memoryEntries];
  }

  /** Genera el Markdown del reporte para un BridgeReport existente. */
  toMarkdown(report: BridgeReport): string {
    return this.reporter.toMarkdown(
      report.requirementsReport,
      report.connectorAId,
      report.connectorBId,
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private mergeRenames(diffs: FieldDiff[], candidates: FieldDiff[]): FieldDiff[] {
    if (candidates.length === 0) return diffs;

    const renamedA = new Set(candidates.map(c => c.pathA!));
    const renamedB = new Set(candidates.map(c => c.pathB!));

    const filtered = diffs.filter(d => {
      if (d.kind === 'field_removed' && d.pathA && renamedA.has(d.pathA)) return false;
      if (d.kind === 'field_added' && d.pathB && renamedB.has(d.pathB)) return false;
      return true;
    });

    // Re-insert candidates sorted by breakingScore
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

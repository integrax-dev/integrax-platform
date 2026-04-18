/**
 * Tipos de timeline
 *
 * Hay cuatro clases de trazas, todas compartiendo la base TimelineEntry:
 *
 *  EntityTrace    -> log de cambios de campos por entidad
 *  SyncTrace      -> registro de polling / ingesta por webhook
 *  ConflictTrace  -> ciclo de vida de conflictos detectados / resueltos
 *  WorkflowTrace  -> ejecucion de pasos de un flujo
 */

// --- Comun ------------------------------------------------------------------

export type TimelineKind = 'entity' | 'sync' | 'conflict' | 'workflow' | 'schema_drift';

export interface TimelineEntry {
  /** ulid ordenable por tiempo de creacion */
  id: string;
  kind: TimelineKind;
  tenantId: string;
  /** Timestamp ISO-8601 del momento en que ocurrio el evento, no de su grabacion */
  occurredAt: Date;
  /** Timestamp ISO-8601 del momento en que se escribio la entrada en la timeline */
  recordedAt: Date;
  /** Anotacion libre opcional agregada por una persona o automatizacion */
  note?: string;
}

// --- Trazas de entidad ------------------------------------------------------

/** Cambio de un solo campo dentro de una transicion de snapshot de entidad. */
export interface FieldDelta {
  field: string;
  before: unknown;
  after: unknown;
}

export interface EntityTrace extends TimelineEntry {
  kind: 'entity';
  entityType: string;
  canonicalId: string;
  sourceSystem: string;
  /** Array vacio = primera vez que vimos esta entidad (evento de creacion). */
  deltas: FieldDelta[];
  /** SHA-256 del payload anterior a este cambio (null en una creacion). */
  previousHash: string | null;
  /** SHA-256 del payload posterior a este cambio. */
  currentHash: string;
  actor: 'system' | 'user' | 'connector';
}

// --- Trazas de sincronizacion -----------------------------------------------

export type SyncTrigger = 'poll' | 'webhook' | 'manual' | 'replay';

export interface SyncTrace extends TimelineEntry {
  kind: 'sync';
  sourceSystem: string;
  trigger: SyncTrigger;
  entityType: string;
  /** Cantidad de registros traidos desde el sistema origen. */
  recordsFetched: number;
  /** Cantidad de snapshots efectivamente actualizados (cambio de hash). */
  recordsChanged: number;
  /** Valor de cursor usado en este poll (null para webhook o manual). */
  cursor: string | null;
  /** Valor de cursor al terminar esta sincronizacion; lo usa el siguiente poll. */
  cursorAfter: string | null;
  durationMs: number;
  error?: string;
}

// --- Trazas de conflicto ----------------------------------------------------

export type ConflictStatus = 'detected' | 'acknowledged' | 'resolving' | 'resolved' | 'dismissed';

export interface ConflictTrace extends TimelineEntry {
  kind: 'conflict';
  entityType: string;
  canonicalId: string;
  /** Categoria proveniente de platform-kernel ConflictCategory. */
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  systemA: string;
  systemB: string;
  /** IDs de snapshots que se compararon. */
  snapshotIds: [string, string];
  status: ConflictStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

// --- Trazas de schema drift -------------------------------------------------

export type SchemaDriftSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface SchemaDriftTrace extends TimelineEntry {
  kind: 'schema_drift';
  connectorAId: string;
  connectorBId: string;
  reportId: string;
  impactScore: number;
  impactLabel: SchemaDriftSeverity;
  driftsDetected: number;
  breakingChanges: number;
  /** Primary routing target from ImpactAssessment */
  routingTarget: string;
  /** Human-readable summary */
  summary: string;
  /** Top remediation hints (max 5) */
  hints: Array<{
    kind: string;
    severity: string;
    title: string;
    suggestedAction: string;
  }>;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  resolvedAt?: Date;
}

// --- Trazas de workflow -----------------------------------------------------

export type WorkflowStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowStepTrace {
  stepId: string;
  nodeType: string;
  status: WorkflowStepStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  output?: unknown;
}

export interface WorkflowTrace extends TimelineEntry {
  kind: 'workflow';
  flowId: string;
  flowName: string;
  runId: string;
  triggerType: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  steps: WorkflowStepTrace[];
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  /** Correlacion con la entidad o conflicto que disparo este workflow. */
  correlatedEntityType?: string;
  correlatedEntityId?: string;
}

// --- Filtros / query --------------------------------------------------------

export interface TimelineFilter {
  kind?: TimelineKind | TimelineKind[];
  entityType?: string;
  canonicalId?: string;
  sourceSystem?: string;
  severity?: Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>;
  /** Limite inferior inclusivo */
  from?: Date;
  /** Limite superior inclusivo */
  to?: Date;
  limit?: number;
  /** Paginacion por cursor; pasar el id de la ultima entrada */
  after?: string;
}

// --- Interfaz del store -----------------------------------------------------

/** Union de todas las entradas concretas, sin los campos generados por el store. */
export type TimelineEntryInput =
  | Omit<EntityTrace, 'id' | 'recordedAt'>
  | Omit<SyncTrace, 'id' | 'recordedAt'>
  | Omit<ConflictTrace, 'id' | 'recordedAt'>
  | Omit<WorkflowTrace, 'id' | 'recordedAt'>
  | Omit<SchemaDriftTrace, 'id' | 'recordedAt'>;

export interface TimelineStore {
  append(tenantId: string, entry: TimelineEntryInput): Promise<TimelineEntry>;
  list(tenantId: string, filter?: TimelineFilter): Promise<TimelineEntry[]>;
  get(tenantId: string, id: string): Promise<TimelineEntry | null>;
  /**
   * Actualiza los campos mutables de un ConflictTrace (status, resolvedAt,
   * resolvedBy, resolution). El resto de las entradas son inmutables.
   */
  resolveConflict(
    tenantId: string,
    id: string,
    resolution: Pick<ConflictTrace, 'status' | 'resolvedAt' | 'resolvedBy' | 'resolution'>,
  ): Promise<ConflictTrace>;
}

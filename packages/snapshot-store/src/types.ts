import type { ExternalId } from '@integrax/entities';
import type { ComparisonResult, ComparisonRule } from '@integrax/platform-kernel';

export interface EntitySnapshot {
  /** ID unico del snapshot (ulid). */
  snapshotId: string;
  tenantId: string;
  /** Tipo de entidad canonica: 'product' | 'order' | 'invoice' | 'customer' | etc. */
  entityType: string;
  /** ID canonico estable asignado por el identity resolver. */
  canonicalId: string;
  /** Todos los external IDs conocidos para esta entidad a traves de conectores. */
  externalIds: ExternalId[];
  /** SHA-256 hexadecimal del payload normalizado. Se usa para detectar cambios rapido. */
  payloadHash: string;
  /** Payload completo de la entidad al momento de capturar el snapshot. */
  payload: Record<string, unknown>;
  sourceSystem: string;
  /** Timestamp del sistema origen (el updatedAt propio de la entidad). */
  updatedAtSource: Date;
  /** Timestamp del momento en que se capturo este snapshot. */
  updatedAtSnapshot: Date;
}

export interface SnapshotFilter {
  sourceSystem?: string;
  since?: Date;
  limit?: number;
}

export interface SnapshotDiff {
  previous: EntitySnapshot;
  current: EntitySnapshot;
  comparison: ComparisonResult;
  hasChanges: boolean;
}

/** Interfaz que toda implementacion de SnapshotStore debe cumplir. */
export interface SnapshotStore {
  get(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot | null>;

  /** Devuelve todos los snapshots de la entidad, uno por sourceSystem. */
  getAll(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot[]>;

  upsert(snapshot: EntitySnapshot): Promise<void>;

  list(
    tenantId: string,
    entityType: string,
    filter?: SnapshotFilter,
  ): Promise<EntitySnapshot[]>;

  /** Compara dos snapshots usando el diff de platform-kernel. */
  diff(
    a: EntitySnapshot,
    b: EntitySnapshot,
    rules?: ComparisonRule[],
  ): ComparisonResult;
}

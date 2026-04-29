import type {
  ConnectorContractBaseline,
  ConnectorFieldSpec,
  ContractChange,
  ContractChangeType,
  ContractImpactScore,
  ContractChangeFilter,
} from './types.js';

function fieldKey(f: ConnectorFieldSpec): string {
  return `${f.path}|${f.type}|${f.required}|${f.format ?? ''}|${(f.enumValues ?? []).sort().join(',')}`;
}

function impactScore(changeType: ContractChangeType): ContractImpactScore {
  switch (changeType) {
    case 'field_removed':  return 5;
    case 'type_changed':   return 4;
    case 'required_changed': return 3;
    case 'enum_changed':   return 2;
    case 'format_changed': return 1;
    case 'field_added':    return 0;
    default:               return 0;
  }
}

function changeSummary(changeType: ContractChangeType, fieldPath: string): string {
  switch (changeType) {
    case 'field_added':      return `Field '${fieldPath}' added to connector output`;
    case 'field_removed':    return `Field '${fieldPath}' removed from connector output`;
    case 'type_changed':     return `Type of field '${fieldPath}' changed`;
    case 'required_changed': return `Nullability of field '${fieldPath}' changed`;
    case 'format_changed':   return `Format hint for field '${fieldPath}' changed`;
    case 'enum_changed':     return `Allowed values for field '${fieldPath}' changed`;
    default:                 return `Change detected on field '${fieldPath}'`;
  }
}

let _seq = 0;
function nextId(): string {
  return `cc_${Date.now()}_${(++_seq).toString(36)}`;
}

/**
 * ConnectorContractRegistry — tracks structural baselines and diffs new schemas.
 *
 * No field values are ever stored — only structural metadata (path, type, format, enums).
 */
export class ConnectorContractRegistry {
  private readonly baselines = new Map<string, ConnectorContractBaseline>();
  private readonly changes: ContractChange[] = [];

  /** Register or replace the baseline for a connector. Does not emit changes. */
  registerBaseline(baseline: ConnectorContractBaseline): void {
    this.baselines.set(baseline.connectorId, { ...baseline, fields: baseline.fields.map(f => ({ ...f })) });
  }

  getBaseline(connectorId: string): ConnectorContractBaseline | null {
    return this.baselines.get(connectorId) ?? null;
  }

  /**
   * Compare a new schema against the registered baseline.
   * Returns detected ContractChanges and stores them internally.
   * affectedTenantCount defaults to 0 — callers inject this from mapping store.
   */
  detectChanges(
    connectorId: string,
    newFields: ConnectorFieldSpec[],
    opts: { schemaVersion?: string; affectedTenantCount?: number } = {},
  ): ContractChange[] {
    const baseline = this.baselines.get(connectorId);
    if (!baseline) return [];

    const oldMap = new Map(baseline.fields.map(f => [f.path, f]));
    const newMap = new Map(newFields.map(f => [f.path, f]));
    const detected: ContractChange[] = [];

    for (const [path, oldField] of oldMap) {
      const newField = newMap.get(path);
      if (!newField) {
        detected.push(this.makeChange(connectorId, path, 'field_removed', opts));
        continue;
      }
      if (oldField.type !== newField.type) {
        detected.push(this.makeChange(connectorId, path, 'type_changed', opts));
      } else if (oldField.required !== newField.required) {
        detected.push(this.makeChange(connectorId, path, 'required_changed', opts));
      } else if (oldField.format !== newField.format) {
        detected.push(this.makeChange(connectorId, path, 'format_changed', opts));
      } else if (fieldKey(oldField) !== fieldKey(newField)) {
        detected.push(this.makeChange(connectorId, path, 'enum_changed', opts));
      }
    }

    for (const path of newMap.keys()) {
      if (!oldMap.has(path)) {
        detected.push(this.makeChange(connectorId, path, 'field_added', opts));
      }
    }

    this.changes.push(...detected);
    return detected;
  }

  listChanges(filter: ContractChangeFilter = {}): ContractChange[] {
    return this.changes.filter(c => {
      if (filter.connectorId && c.connectorId !== filter.connectorId) return false;
      if (filter.changeType && c.changeType !== filter.changeType) return false;
      if (filter.minImpactScore !== undefined && c.impactScore < filter.minImpactScore) return false;
      if (filter.since && c.detectedAt < filter.since) return false;
      return true;
    }).slice(0, filter.limit ?? 500);
  }

  private makeChange(
    connectorId: string,
    fieldPath: string,
    changeType: ContractChangeType,
    opts: { schemaVersion?: string; affectedTenantCount?: number },
  ): ContractChange {
    return {
      id: nextId(),
      connectorId,
      fieldPath,
      changeType,
      impactScore: impactScore(changeType) as ContractImpactScore,
      affectedTenantCount: opts.affectedTenantCount ?? 0,
      detectedAt: new Date(),
      schemaVersion: opts.schemaVersion,
      summary: changeSummary(changeType, fieldPath),
    };
  }
}

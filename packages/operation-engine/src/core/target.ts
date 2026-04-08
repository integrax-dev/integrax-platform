/**
 * OperationTarget
 *
 * What the operation acts upon. May resolve to a connector/facade,
 * an internal module, or a canonical entity in the snapshot store.
 */

export interface ExternalIdRef {
  system: string;
  id: string;
}

export interface OperationTarget {
  /**
   * Which connector handles this operation (e.g. 'mercadopago', 'contabilium').
   * Either connectorId or systemId must be set for external operations;
   * neither is required for internal module operations.
   */
  connectorId?: string;
  /**
   * Internal system identifier (e.g. module name: 'billing', 'inventory').
   * Used when the operation targets an internal module rather than an external connector.
   */
  systemId?: string;
  /** Canonical entity type: 'order', 'invoice', 'product', 'customer'… */
  entityType?: string;
  /** Stable platform-internal identifier. */
  canonicalId?: string;
  /** All known external references for this entity, for resolution. */
  externalIds?: ExternalIdRef[];
  /**
   * Arbitrary resource path for operations that don't map to a canonical entity
   * (e.g. a Google Sheets range, a raw API endpoint).
   */
  resource?: string;
}

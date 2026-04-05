/**
 * Connector Facade Types
 *
 * The stable interface that integration-engine and Activepieces use to
 * interact with any connector. Never import generated clients directly —
 * always go through ConnectorFacade.
 */

/**
 * The facade interface every connector must expose via facade/facade.ts.
 * Hides auth, retry, rate-limiting, pagination, and error normalization.
 */
export interface ConnectorFacade {
  /**
   * Execute any named operation.
   * Operation names match the keys in ConnectorManifest.operations.
   */
  execute(operation: string, input: Record<string, unknown>): Promise<unknown>;

  /**
   * List all entities of a given type from this connector.
   * Returns raw API objects — reconciliation engine does the canonicalization.
   */
  listEntities(entity: string, params?: Record<string, unknown>): Promise<unknown[]>;

  /**
   * Fetch a single entity by its native ID in this system.
   */
  getEntity(entity: string, id: string): Promise<unknown>;

  /**
   * Apply a partial update to an entity.
   * Used by AUTO_FIX policy actions.
   */
  updateEntity(entity: string, id: string, patch: Record<string, unknown>): Promise<unknown>;
}

/**
 * Declares what a connector can do per entity type.
 * Generated from connector.manifest.ts into facade/capabilities.ts.
 * Integration-engine reads this to build available actions dynamically.
 */
export interface ConnectorCapabilities {
  [entity: string]: {
    list?: boolean;
    get?: boolean;
    update?: boolean;
    create?: boolean;
  };
}

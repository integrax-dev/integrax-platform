/**
 * Connector Manifest Types
 *
 * Declarative schema for connector.manifest.ts files.
 * Each connector declares its capabilities, entity mappings, and integration points.
 * No procedural logic allowed in manifests — data only.
 */

/**
 * The single required file per connector.
 * Lives at: connectors/implementations/<service>/connector.manifest.ts
 */
export interface ConnectorManifest {
  /** Unique service identifier, e.g. 'mercadopago', 'contabilium', 'afip-wsfe' */
  service: string;

  /** Path to OpenAPI / Swagger / Postman spec for code generation (relative to manifest) */
  spec?: string;

  /** Auth configuration */
  auth: {
    type: 'api_key' | 'oauth2' | 'basic' | 'custom';
  };

  /**
   * Which API operations to expose via the facade.
   * Keys match operation names in the spec or existing connector actions.
   * true = expose, false = hide.
   */
  operations?: Record<string, boolean>;

  /**
   * Entity mappings for the reconciliation engine.
   * Keys are canonical entity names ('product', 'order', 'customer', 'invoice').
   */
  entities?: Record<string, EntityManifest>;

  /**
   * API drift monitoring configuration.
   * Endpoints listed here are automatically registered with connector-watchdog.
   */
  drift?: {
    endpoints: string[];
  };

  /**
   * Optional lifecycle hooks per entity.
   * Keys are entity names, values are paths to hook files (relative to manifest).
   * Hooks fire before/after reconciliation actions.
   */
  hooks?: Record<string, string>;
}

/**
 * Entity configuration within a manifest.
 * Tells the reconciliation engine how to extract canonical fields
 * from the raw API response of this service.
 */
export interface EntityManifest {
  /** Name of the API resource (e.g. 'products', 'items', 'comprobantes') */
  source: string;

  /** Identity signals used to match entities across systems */
  identity: {
    /** Primary identity fields, in priority order. Supports dot paths and array notation. */
    primary: string[];
    /** Fallback fields used when primary fields don't produce a confident match */
    fallback?: string[];
  };

  /**
   * Maps canonical field names to source field paths.
   * Canonical names: externalId, sku, title, price, currency, stock, status, updatedAt
   * Paths: dot notation, e.g. 'variants[0].price', 'updated_at'
   */
  fields: Record<string, string>;
}

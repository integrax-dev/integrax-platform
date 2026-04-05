/**
 * Manifest shape expected by the reconciliation engine.
 *
 * Structurally compatible with ConnectorManifest from @integrax/connector-sdk
 * but defined locally — so this package has zero external dependencies.
 *
 * Connector authors use ConnectorManifest from connector-sdk for type-checking
 * their manifest files. The registry accepts any object matching this shape.
 */

export interface EntityManifestShape {
  source: string;
  identity: {
    primary: string[];
    fallback?: string[];
  };
  fields: Record<string, string>;
}

export interface ConnectorManifestShape {
  service: string;
  spec?: string;
  auth: { type: string };
  operations?: Record<string, boolean>;
  entities?: Record<string, EntityManifestShape>;
  drift?: { endpoints: string[] };
  hooks?: Record<string, string>;
}

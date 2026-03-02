/**
 * Schema Fingerprinter
 *
 * Computes deterministic, content-addressable fingerprints for API schemas
 * (OpenAPI 3.x). Fingerprints are stable across whitespace/ordering changes
 * so only semantic diffs trigger drift alerts.
 */

import { createHash } from 'node:crypto';
import type { SchemaFingerprint, EndpointSignature } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise an arbitrary value to a canonical JSON string:
 *  - object keys are sorted recursively
 *  - arrays are preserved in order (order matters for responses)
 *  - undefined / null become empty string
 */
export function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalise).join(',') + ']';
  }

  const sorted = Object.keys(value as object)
    .sort()
    .map(k => `"${k}":${canonicalise((value as Record<string, unknown>)[k])}`);

  return '{' + sorted.join(',') + '}';
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

// ─── OpenAPI Parsing ──────────────────────────────────────────────────────────

interface OpenAPISpec {
  info?: { title?: string; version?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  security?: unknown[];
}

type PathItem = Record<string, OperationObject | unknown>;

interface OperationObject {
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
  security?: unknown[];
}

interface ParameterObject {
  name?: string;
  in?: string;
  schema?: unknown;
  required?: boolean;
}

interface RequestBodyObject {
  content?: Record<string, { schema?: unknown }>;
  required?: boolean;
}

interface ResponseObject {
  content?: Record<string, { schema?: unknown }>;
  description?: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

// ─── Core Fingerprinter ───────────────────────────────────────────────────────

export class SchemaFingerprinter {
  /**
   * Compute a full fingerprint from an OpenAPI spec object.
   * @param connectorId  Stable connector identifier
   * @param spec         Parsed OpenAPI 3.x spec
   */
  fingerprint(connectorId: string, spec: OpenAPISpec): SchemaFingerprint {
    const endpoints = this.extractEndpoints(spec);
    const authHash = this.hashAuth(spec);
    const infoHash = this.hashInfo(spec);

    // Top-level fingerprint: hash of all endpoint hashes + auth + info
    const combined = endpoints.map(e => e.paramsHash + e.requestHash + e.responseHash).join('|')
      + '|' + authHash
      + '|' + infoHash;

    const fingerprint = sha256(combined);

    return {
      connectorId,
      version: spec.info?.version ?? 'unknown',
      capturedAt: new Date().toISOString(),
      fingerprint,
      endpoints,
      authHash,
      infoHash,
    };
  }

  /**
   * Compute fingerprint directly from a JSON string (e.g. loaded from disk).
   */
  fingerprintFromJson(connectorId: string, jsonStr: string): SchemaFingerprint {
    const spec: OpenAPISpec = JSON.parse(jsonStr);
    return this.fingerprint(connectorId, spec);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private extractEndpoints(spec: OpenAPISpec): EndpointSignature[] {
    const endpoints: EndpointSignature[] = [];
    const paths = spec.paths ?? {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const op = (pathItem as PathItem)[method] as OperationObject | undefined;
        if (!op || typeof op !== 'object') continue;

        endpoints.push({
          method: method.toUpperCase(),
          path,
          paramsHash: this.hashParams(op.parameters),
          requestHash: this.hashRequestBody(op.requestBody),
          responseHash: this.hashResponses(op.responses),
          authScheme: this.extractOperationAuth(op, spec),
        });
      }
    }

    // Sort for stability
    return endpoints.sort((a, b) =>
      `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`)
    );
  }

  private hashParams(params?: ParameterObject[]): string {
    if (!params || params.length === 0) return sha256('');
    const normalised = params
      .map(p => ({ name: p.name, in: p.in, schema: p.schema, required: p.required }))
      .sort((a, b) => `${a.in}:${a.name}`.localeCompare(`${b.in}:${b.name}`));
    return sha256(canonicalise(normalised));
  }

  private hashRequestBody(rb?: RequestBodyObject): string {
    if (!rb) return sha256('');
    const schemas = rb.content
      ? Object.entries(rb.content)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ct, val]) => ({ ct, schema: val.schema }))
      : [];
    return sha256(canonicalise({ required: rb.required, schemas }));
  }

  private hashResponses(responses?: Record<string, ResponseObject>): string {
    if (!responses) return sha256('');
    const normalised = Object.entries(responses)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, r]) => ({
        code,
        schemas: r.content
          ? Object.entries(r.content)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ct, v]) => ({ ct, schema: v.schema }))
          : [],
      }));
    return sha256(canonicalise(normalised));
  }

  private hashAuth(spec: OpenAPISpec): string {
    const schemes = spec.components?.securitySchemes ?? {};
    const global = spec.security ?? [];
    return sha256(canonicalise({ schemes, global }));
  }

  private hashInfo(spec: OpenAPISpec): string {
    return sha256(canonicalise({
      title: spec.info?.title,
      version: spec.info?.version,
      baseUrl: spec.servers?.[0]?.url,
    }));
  }

  private extractOperationAuth(op: OperationObject, spec: OpenAPISpec): string | undefined {
    const security = op.security ?? spec.security;
    if (!security || security.length === 0) return undefined;
    return sha256(canonicalise(security));
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _instance: SchemaFingerprinter | null = null;

export function getFingerprinter(): SchemaFingerprinter {
  if (!_instance) _instance = new SchemaFingerprinter();
  return _instance;
}

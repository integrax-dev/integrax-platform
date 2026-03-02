/**
 * Evidence Builder
 *
 * Assembles an EvidencePack from a DriftReport + live HTTP samples.
 * The pack is stored as a JSON file and its path is recorded in the report.
 *
 * An EvidencePack contains:
 *  - The full DriftReport
 *  - Up to N recent HTTP request/response samples for the affected connector
 *  - The baseline and current OpenAPI specs (if available)
 *  - Environment metadata
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DriftReport, EvidencePack, HttpSample } from './types.js';

// ─── Evidence Builder ─────────────────────────────────────────────────────────

export class EvidenceBuilder {
  constructor(private readonly evidenceDir: string) {}

  /**
   * Build and persist an EvidencePack for the given drift report.
   * @param report       The drift report
   * @param httpSamples  Recent HTTP traffic samples (limited automatically)
   * @param baselineSpec The baseline OpenAPI spec JSON (optional)
   * @param currentSpec  The current OpenAPI spec JSON (optional)
   * @param maxSamples   Maximum samples to include (default 50)
   */
  async build(
    report: DriftReport,
    httpSamples: HttpSample[],
    baselineSpec?: unknown,
    currentSpec?: unknown,
    maxSamples = 50,
  ): Promise<EvidencePack> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const pack: EvidencePack = {
      id,
      connectorId: report.connectorId,
      createdAt,
      drift: report,
      httpSamples: httpSamples.slice(0, maxSamples),
      baselineSpec,
      currentSpec,
      connectorVersion: report.current.version,
      environment: this.detectEnvironment(),
      tags: this.buildTags(report),
    };

    const filePath = await this.persist(pack);

    // Mutate report to record pack path
    report.evidencePackPath = filePath;

    return pack;
  }

  /**
   * Load an existing evidence pack from disk.
   */
  async load(packId: string): Promise<EvidencePack | null> {
    try {
      const filePath = join(this.evidenceDir, `${packId}.json`);
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as EvidencePack;
    } catch {
      return null;
    }
  }

  /**
   * Create an HTTP sample from a raw fetch response.
   * Convenience helper for intercepting live traffic.
   */
  static createSample(
    method: string,
    url: string,
    requestHeaders: Record<string, string>,
    requestBody: unknown,
    responseStatus: number,
    responseHeaders: Record<string, string>,
    responseBody: unknown,
    latencyMs: number,
    error?: string,
  ): HttpSample {
    return {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      requestHeaders: sanitiseHeaders(requestHeaders),
      requestBody,
      responseStatus,
      responseHeaders,
      responseBody,
      latencyMs,
      error,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async persist(pack: EvidencePack): Promise<string> {
    await mkdir(this.evidenceDir, { recursive: true });
    const filePath = join(this.evidenceDir, `${pack.id}.json`);
    await writeFile(filePath, JSON.stringify(pack, null, 2), 'utf-8');
    return filePath;
  }

  private detectEnvironment(): EvidencePack['environment'] {
    const env = process.env.NODE_ENV ?? 'production';
    if (env === 'test' || env === 'testing') return 'testing';
    if (env === 'staging') return 'staging';
    return 'production';
  }

  private buildTags(report: DriftReport): string[] {
    const tags: string[] = [
      `connector:${report.connectorId}`,
      `severity:${report.severity}`,
    ];

    const types = [...new Set(report.changes.map(c => c.type))];
    for (const t of types) tags.push(`drift:${t}`);

    return tags;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-access-token',
]);

/**
 * Remove sensitive values from headers before storing in evidence.
 */
function sanitiseHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    clean[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : val;
  }
  return clean;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createEvidenceBuilder(evidenceDir: string): EvidenceBuilder {
  return new EvidenceBuilder(evidenceDir);
}

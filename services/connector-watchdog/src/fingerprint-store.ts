/**
 * Fingerprint Store
 *
 * Persists and retrieves SchemaFingerprints on disk as JSON files.
 * Each connector has one "baseline" and one "latest" snapshot.
 *
 * Layout:
 *   {fingerprintDir}/
 *     {connectorId}/
 *       baseline.json   ← set once, updated only after resolution
 *       latest.json     ← always the most recent snapshot
 *       history/
 *         {timestamp}.json  ← archived snapshots
 */

import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { SchemaFingerprint } from './types.js';

export class FingerprintStore {
  constructor(private readonly dir: string) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getBaseline(connectorId: string): Promise<SchemaFingerprint | null> {
    return this.read(connectorId, 'baseline.json');
  }

  async getLatest(connectorId: string): Promise<SchemaFingerprint | null> {
    return this.read(connectorId, 'latest.json');
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  /**
   * Save the current fingerprint as "latest".
   * On first call (no baseline exists), also sets it as baseline.
   */
  async save(fp: SchemaFingerprint): Promise<void> {
    const connDir = this.connDir(fp.connectorId);
    await mkdir(connDir, { recursive: true });

    const latestPath = join(connDir, 'latest.json');
    await writeFile(latestPath, JSON.stringify(fp, null, 2), 'utf-8');

    // Archive to history (sanitise timestamp: colons invalid on Windows)
    const histDir = join(connDir, 'history');
    await mkdir(histDir, { recursive: true });
    const safeTimestamp = fp.capturedAt.replace(/[:.]/g, '-');
    await writeFile(join(histDir, `${safeTimestamp}.json`), JSON.stringify(fp, null, 2), 'utf-8');

    // Bootstrap baseline if missing
    const baselinePath = join(connDir, 'baseline.json');
    const hasBaseline = await fileExists(baselinePath);
    if (!hasBaseline) {
      await copyFile(latestPath, baselinePath);
    }
  }

  /**
   * Promote "latest" to "baseline" (called after a drift is resolved).
   */
  async promoteToBaseline(connectorId: string): Promise<void> {
    const connDir = this.connDir(connectorId);
    const latestPath = join(connDir, 'latest.json');
    const baselinePath = join(connDir, 'baseline.json');
    await copyFile(latestPath, baselinePath);
  }

  /**
   * Explicitly set a specific fingerprint as baseline.
   */
  async setBaseline(fp: SchemaFingerprint): Promise<void> {
    const connDir = this.connDir(fp.connectorId);
    await mkdir(connDir, { recursive: true });
    await writeFile(join(connDir, 'baseline.json'), JSON.stringify(fp, null, 2), 'utf-8');
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private connDir(connectorId: string): string {
    return join(this.dir, connectorId);
  }

  private async read(connectorId: string, filename: string): Promise<SchemaFingerprint | null> {
    try {
      const filePath = join(this.connDir(connectorId), filename);
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as SchemaFingerprint;
    } catch {
      return null;
    }
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFingerprintStore(dir: string): FingerprintStore {
  return new FingerprintStore(dir);
}

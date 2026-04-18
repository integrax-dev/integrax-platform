import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IStorageAdapter, StorageObject, UploadOptions } from './adapter.js';

/**
 * Local filesystem adapter — dev and self-hosted deployments.
 * Files are stored under `baseDir/{key}`.
 * Presigned URLs are just `{baseUrl}/{key}` (no real signing).
 */
export class LocalStorageAdapter implements IStorageAdapter {
  constructor(
    private readonly baseDir: string,
    private readonly baseUrl = 'http://localhost:3000/storage',
  ) {}

  private fullPath(key: string): string {
    return path.join(this.baseDir, key);
  }

  async upload(key: string, data: Buffer | Uint8Array, opts?: UploadOptions): Promise<string> {
    const fp = this.fullPath(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, data);
    if (opts?.metadata) {
      await fs.writeFile(`${fp}.meta.json`, JSON.stringify(opts.metadata));
    }
    return `${this.baseUrl}/${key}`;
  }

  async download(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.fullPath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.fullPath(key)).catch(() => {});
    await fs.unlink(`${this.fullPath(key)}.meta.json`).catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string): Promise<StorageObject | null> {
    try {
      const s = await fs.stat(this.fullPath(key));
      let metadata: Record<string, string> = {};
      try {
        const raw = await fs.readFile(`${this.fullPath(key)}.meta.json`, 'utf8');
        metadata = JSON.parse(raw) as Record<string, string>;
      } catch { /* no metadata file */ }
      return {
        key,
        size: s.size,
        contentType: 'application/octet-stream',
        metadata,
        lastModified: s.mtime,
        url: `${this.baseUrl}/${key}`,
      };
    } catch {
      return null;
    }
  }

  async presignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `${this.baseUrl}/${key}`;
  }

  async list(prefix: string, limit = 1000): Promise<StorageObject[]> {
    const dir = path.join(this.baseDir, prefix);
    const results: StorageObject[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true } as Parameters<typeof fs.readdir>[1]);
      for (const entry of entries as import('node:fs').Dirent[]) {
        if (!entry.isFile() || entry.name.endsWith('.meta.json')) continue;
        const full = path.join((entry as unknown as { path: string }).path ?? dir, entry.name);
        const rel = path.relative(this.baseDir, full).replace(/\\/g, '/');
        const s = await fs.stat(full);
        results.push({ key: rel, size: s.size, contentType: 'application/octet-stream', metadata: {}, lastModified: s.mtime });
        if (results.length >= limit) break;
      }
    } catch { /* dir not found */ }
    return results;
  }

  async usedBytes(tenantPrefix: string): Promise<number> {
    const items = await this.list(tenantPrefix, 100_000);
    return items.reduce((sum, o) => sum + o.size, 0);
  }
}

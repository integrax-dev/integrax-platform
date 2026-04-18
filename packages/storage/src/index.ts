export type { IStorageAdapter, StorageObject, UploadOptions } from './adapter.js';
export { R2StorageAdapter } from './r2-adapter.js';
export type { R2Config } from './r2-adapter.js';
export { LocalStorageAdapter } from './local-adapter.js';

import { R2StorageAdapter } from './r2-adapter.js';
import { LocalStorageAdapter } from './local-adapter.js';
import type { IStorageAdapter } from './adapter.js';

/** Factory — picks R2 when env vars present, falls back to local filesystem. */
export function createStorageAdapter(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): IStorageAdapter {
  if (
    env['R2_ACCOUNT_ID'] &&
    env['R2_ACCESS_KEY_ID'] &&
    env['R2_SECRET_ACCESS_KEY'] &&
    env['R2_BUCKET_NAME']
  ) {
    return new R2StorageAdapter({
      accountId: env['R2_ACCOUNT_ID'],
      accessKeyId: env['R2_ACCESS_KEY_ID'],
      secretAccessKey: env['R2_SECRET_ACCESS_KEY'],
      bucketName: env['R2_BUCKET_NAME'],
      publicBaseUrl: env['R2_PUBLIC_BASE_URL'],
    });
  }
  return new LocalStorageAdapter(
    env['LOCAL_STORAGE_DIR'] ?? './storage',
    env['LOCAL_STORAGE_URL'] ?? 'http://localhost:3000/storage',
  );
}

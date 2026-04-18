export interface UploadOptions {
  contentType?: string;
  /** Metadata key-value pairs stored alongside the object */
  metadata?: Record<string, string>;
  /** If set, object expires after this many seconds */
  ttlSeconds?: number;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  metadata: Record<string, string>;
  lastModified: Date;
  url?: string;
}

export interface IStorageAdapter {
  /** Upload a file. Returns the public/signed URL. */
  upload(key: string, data: Buffer | Uint8Array, opts?: UploadOptions): Promise<string>;

  /** Download a file. Returns null if not found. */
  download(key: string): Promise<Buffer | null>;

  /** Delete a file. */
  delete(key: string): Promise<void>;

  /** Check if a file exists. */
  exists(key: string): Promise<boolean>;

  /** Get metadata without downloading the body. */
  stat(key: string): Promise<StorageObject | null>;

  /** Generate a pre-signed URL valid for `expiresInSeconds` (default 3600). */
  presignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** List objects under a prefix. */
  list(prefix: string, limit?: number): Promise<StorageObject[]>;

  /** Get total bytes used under a tenant prefix. */
  usedBytes(tenantPrefix: string): Promise<number>;
}

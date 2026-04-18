import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageAdapter, StorageObject, UploadOptions } from './adapter.js';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** Public URL base, e.g. https://pub-xxx.r2.dev (optional — omit for private buckets) */
  publicBaseUrl?: string;
}

export class R2StorageAdapter implements IStorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase?: string;

  constructor(cfg: R2Config) {
    this.bucket = cfg.bucketName;
    this.publicBase = cfg.publicBaseUrl;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async upload(key: string, data: Buffer | Uint8Array, opts?: UploadOptions): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: opts?.contentType ?? 'application/octet-stream',
      Metadata: opts?.metadata,
      ...(opts?.ttlSeconds ? { Expires: new Date(Date.now() + opts.ttlSeconds * 1000) } : {}),
    }));
    return this.publicBase ? `${this.publicBase}/${key}` : await this.presignedUrl(key);
  }

  async download(key: string): Promise<Buffer | null> {
    try {
      const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async stat(key: string): Promise<StorageObject | null> {
    try {
      const resp = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        size: resp.ContentLength ?? 0,
        contentType: resp.ContentType ?? 'application/octet-stream',
        metadata: resp.Metadata ?? {},
        lastModified: resp.LastModified ?? new Date(),
        url: this.publicBase ? `${this.publicBase}/${key}` : undefined,
      };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async presignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async list(prefix: string, limit = 1000): Promise<StorageObject[]> {
    const resp = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: limit,
    }));
    return (resp.Contents ?? []).map(o => ({
      key: o.Key ?? '',
      size: o.Size ?? 0,
      contentType: 'application/octet-stream',
      metadata: {},
      lastModified: o.LastModified ?? new Date(),
    }));
  }

  async usedBytes(tenantPrefix: string): Promise<number> {
    let total = 0;
    let continuationToken: string | undefined;
    do {
      const resp = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: tenantPrefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }));
      for (const obj of resp.Contents ?? []) total += obj.Size ?? 0;
      continuationToken = resp.NextContinuationToken;
    } while (continuationToken);
    return total;
  }
}

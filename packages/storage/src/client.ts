/**
 * S3-backed object storage client with optional CloudFront CDN URL rewriting.
 *
 * Usage:
 *   const storage = new StorageClient({
 *     bucket: process.env.STORAGE_BUCKET!,
 *     region: process.env.AWS_REGION ?? "us-east-1",
 *     cloudfrontUrl: process.env.CLOUDFRONT_URL,  // optional
 *   });
 *
 *   const url = await storage.upload("key/path.json", Buffer.from("{}"), "application/json");
 *   const data = await storage.download("key/path.json");
 *   const signed = await storage.presignedUpload("key/path.json", 3600);
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageClientOptions {
  bucket: string;
  region?: string;
  /** Optional CloudFront distribution URL — replaces S3 URLs in public responses */
  cloudfrontUrl?: string;
  /** Override endpoint (useful for local MinIO / test environments) */
  endpoint?: string;
  /** Force path-style URLs (required for MinIO) */
  forcePathStyle?: boolean;
}

export interface UploadOptions {
  contentType?: string;
  /** Cache-Control header (default: "private, max-age=3600") */
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export class StorageClient {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cloudfrontUrl: string | undefined;

  constructor(opts: StorageClientOptions) {
    this.bucket = opts.bucket;
    this.cloudfrontUrl = opts.cloudfrontUrl?.replace(/\/$/, "");
    this.s3 = new S3Client({
      region: opts.region ?? "us-east-1",
      ...(opts.endpoint
        ? { endpoint: opts.endpoint, forcePathStyle: opts.forcePathStyle ?? true }
        : {}),
    });
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Upload a buffer or string to S3.
   * Returns the public URL (CloudFront if configured, otherwise S3).
   */
  async upload(key: string, body: Buffer | string, opts: UploadOptions = {}): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: opts.contentType ?? "application/octet-stream",
        CacheControl: opts.cacheControl ?? "private, max-age=3600",
        Metadata: opts.metadata,
      }),
    );
    return this.publicUrl(key);
  }

  /**
   * Upload a JSON-serialisable object.
   */
  async uploadJson(
    key: string,
    data: unknown,
    opts: Omit<UploadOptions, "contentType"> = {},
  ): Promise<string> {
    return this.upload(key, JSON.stringify(data), { ...opts, contentType: "application/json" });
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /** Download an object as a Buffer. */
  async download(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /** Download and parse a JSON object. */
  async downloadJson<T = unknown>(key: string): Promise<T> {
    const buf = await this.download(key);
    return JSON.parse(buf.toString("utf-8")) as T;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // ── Presigned URLs ─────────────────────────────────────────────────────────

  /**
   * Generate a presigned GET URL (for private objects).
   * @param expiresIn seconds until expiry (default 3600)
   */
  async presignedDownload(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }

  /**
   * Generate a presigned PUT URL for direct browser uploads.
   * @param expiresIn seconds until expiry (default 3600)
   */
  async presignedUpload(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Public URL for an object — CloudFront if configured, otherwise S3. */
  publicUrl(key: string): string {
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: StorageClient | undefined;

/** Return a lazily-initialised singleton. Safe to call many times. */
export function getStorage(): StorageClient {
  if (!_instance) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET env var is required");
    _instance = new StorageClient({
      bucket,
      region: process.env.S3_REGION ?? "us-east-1",
      cloudfrontUrl: process.env.CLOUDFRONT_URL,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }
  return _instance;
}

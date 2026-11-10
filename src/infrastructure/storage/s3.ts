import { DeleteObjectsCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertValidKey, type ObjectStorage, type StoredObject } from "./types";

export type S3Config = {
  bucket: string;
  region: string;
  /** Set for S3-compatible services (Cloudflare R2, Tigris, Garage, RustFS, MinIO...). */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs; most self-hosted S3-compatible servers need this. */
  forcePathStyle: boolean;
  /** Optional prefix so one bucket can serve several environments. */
  prefix: string;
};

/**
 * An S3-compatible bucket. The bucket must be private: files are only ever
 * served through the application, which checks workspace membership first.
 */
export class S3Storage implements ObjectStorage {
  readonly driver = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private keyFor(key: string): string {
    assertValidKey(key);
    return `${this.config.prefix}${key}`;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: this.keyFor(key), Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.keyFor(key) }));
      if (!result.Body) return null;
      return { body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>, size: result.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: this.keyFor(key) })), Quiet: true },
      }),
    );
  }
}

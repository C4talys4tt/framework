import "server-only";
import path from "node:path";
import { getEnv } from "@/infrastructure/env";
import { FilesystemStorage } from "./filesystem";
import { S3Storage } from "./s3";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";

const globalForStorage = globalThis as typeof globalThis & { __frameworkStorage?: ObjectStorage };

/** The configured object storage. Created lazily so builds need no credentials. */
export function getStorage(): ObjectStorage {
  if (globalForStorage.__frameworkStorage) return globalForStorage.__frameworkStorage;
  const env = getEnv();
  let storage: ObjectStorage;
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY. See .env.example.");
    }
    storage = new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      prefix: env.S3_PREFIX,
    });
  } else {
    storage = new FilesystemStorage(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_DIR));
  }
  globalForStorage.__frameworkStorage = storage;
  return storage;
}

import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { assertValidKey, type ObjectStorage, type StoredObject } from "./types";

/**
 * Stores objects as files under one directory. For local development and
 * single-server deployments with a persistent disk; it does not replicate and
 * cannot be shared between several application instances.
 */
export class FilesystemStorage implements ObjectStorage {
  readonly driver = "filesystem";

  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertValidKey(key);
    const resolved = path.resolve(this.root, key);
    // Defence in depth: the key pattern already excludes traversal.
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Key escapes the storage root");
    return resolved;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, body);
    await rename(temporary, target);
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.pathFor(key);
    try {
      const info = await stat(target);
      if (!info.isFile()) return null;
      const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;
      return { body: stream, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.pathFor(key), { force: true })));
  }
}

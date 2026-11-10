import "server-only";
import { randomUUID } from "node:crypto";
import { withUser } from "@/infrastructure/db/with-user";
import { getStorage } from "@/infrastructure/storage";
import { LibraryError } from "../domain/errors";
import { MAX_UPLOAD_BYTES, cleanFilename, formatBytes, sniffImageType, titleFromFilename } from "../domain/files";
import type { ReferenceListItem } from "../domain/reference";
import { addToCollection } from "./collection-repository";
import { UnreadableImageError, processImage } from "./image-processing";
import { findDuplicate, insertReference, linkReferencesToProject } from "./reference-repository";

export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadResult = {
  reference: ReferenceListItem;
  duplicateOf: { id: string; title: string } | null;
  /** Set when the image was stored but could not be added where it was uploaded from. */
  warning: string | null;
};

/** Reads a request body, refusing as soon as it passes `limit` bytes (Content-Length can lie). */
export async function readLimitedBody(body: ReadableStream<Uint8Array> | null, limit = MAX_UPLOAD_BYTES): Promise<Uint8Array> {
  if (!body) throw new UploadError(400, "No file was sent.");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new UploadError(413, `This file is larger than the ${formatBytes(limit)} limit.`);
    }
    chunks.push(value);
  }
  if (total === 0) throw new UploadError(400, "This file is empty.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export const variantKey = (storageKey: string, variant: "original" | "preview" | "thumb") => `${storageKey}/${variant}`;

/**
 * Validates, processes and stores one image, then records it. The files are
 * written before the row, and removed again if the row cannot be written, so
 * a failure never leaves a reference pointing at nothing.
 */
export async function ingestUpload(input: {
  userId: string;
  workspaceId: string;
  bytes: Uint8Array;
  filename: string;
  collectionId?: string | null;
  projectId?: string | null;
}): Promise<UploadResult> {
  const member = await withUser(input.userId, async (db) => {
    const { rowCount } = await db.query("select 1 from public.workspaces where id = $1", [input.workspaceId]);
    return rowCount === 1;
  });
  if (!member) throw new UploadError(404, "That workspace no longer exists, or you don’t have access to it.");

  const type = sniffImageType(input.bytes);
  if (!type) {
    throw new UploadError(415, "Only JPEG, PNG, WebP, GIF, AVIF and TIFF images can be added. This file is something else.");
  }

  let processed;
  try {
    processed = await processImage(input.bytes);
  } catch (error) {
    if (error instanceof UnreadableImageError) throw new UploadError(422, error.message);
    throw error;
  }

  const filename = cleanFilename(input.filename);
  // The key comes from ids only, so two files called "final.jpg" can never collide.
  const storageKey = `ws/${input.workspaceId}/${randomUUID()}`;
  const storage = getStorage();
  const keys = [variantKey(storageKey, "original"), variantKey(storageKey, "preview"), variantKey(storageKey, "thumb")];
  await Promise.all([
    storage.put(keys[0]!, input.bytes, type),
    storage.put(keys[1]!, processed.preview, "image/webp"),
    storage.put(keys[2]!, processed.thumb, "image/webp"),
  ]).catch(async (error) => {
    await storage.delete(keys).catch(() => undefined);
    throw error;
  });

  let saved: { reference: ReferenceListItem; duplicateOf: { id: string; title: string } | null };
  try {
    saved = await withUser(input.userId, async (db) => {
      const duplicateOf = await findDuplicate(db, input.workspaceId, processed.sha256);
      const reference = await insertReference(db, {
        workspaceId: input.workspaceId,
        createdBy: input.userId,
        title: titleFromFilename(filename),
        storageKey,
        originalFilename: filename,
        mimeType: type,
        byteSize: input.bytes.byteLength,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        dominantColor: processed.dominantColor,
        metadata: processed.metadata,
      });
      return { reference, duplicateOf };
    });
  } catch (error) {
    await storage.delete(keys).catch((cleanup) => console.error("[library] could not remove files after a failed insert", cleanup));
    throw error;
  }

  // Attaching is a separate step: the image is kept even if, say, the project was archived meanwhile.
  let warning: string | null = null;
  if (input.collectionId || input.projectId) {
    try {
      await withUser(input.userId, async (db) => {
        if (input.collectionId) {
          const added = await addToCollection(db, input.collectionId, [saved.reference.id]);
          if (added === null) warning = "The image was added to the library, but that collection no longer exists.";
        }
        if (input.projectId) await linkReferencesToProject(db, input.projectId, [saved.reference.id]);
      });
    } catch (error) {
      if (!(error instanceof LibraryError)) throw error;
      warning = `The image was added to the library, but not to the project: ${error.message}`;
    }
  }

  return { ...saved, warning };
}

/** Removes a deleted reference's files. Failures are logged, not surfaced: the row is already gone. */
export async function removeStoredFiles(storageKey: string): Promise<void> {
  try {
    await getStorage().delete([variantKey(storageKey, "original"), variantKey(storageKey, "preview"), variantKey(storageKey, "thumb")]);
  } catch (error) {
    console.error(`[library] could not remove files for ${storageKey}; they are now orphaned`, error);
  }
}

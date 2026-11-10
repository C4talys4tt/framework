import "server-only";
import { z } from "zod";
import { withUser } from "@/infrastructure/db/with-user";
import { getStorage } from "@/infrastructure/storage";
import { getCurrentUser } from "@/modules/auth/server/session";
import { VARIANTS } from "../domain/files";
import { getReferenceFile } from "./reference-repository";
import { variantKey } from "./upload";

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/library/files/<referenceId>/<thumb|preview|original>[?download=1]
 *
 * Every file is served through here, after the session and row-level security
 * have confirmed the viewer belongs to the reference's workspace. A reference
 * in another workspace is indistinguishable from one that does not exist.
 */
export async function serveReferenceFile(request: Request, referenceId: string, variant: string): Promise<Response> {
  const params = z.object({ referenceId: z.uuid(), variant: z.enum(VARIANTS) }).safeParse({ referenceId, variant });
  if (!params.success) return NOT_FOUND();

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to view this file.", { status: 401, headers: { "Cache-Control": "no-store" } });

  const file = await withUser(user.id, (db) => getReferenceFile(db, params.data.referenceId));
  if (!file) return NOT_FOUND();

  // Files never change for a given id, so the hash is a perfect validator.
  const etag = `"${file.sha256.slice(0, 32)}-${params.data.variant}"`;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const common: Record<string, string> = {
    ETag: etag,
    // Private: only this browser may keep it. Immutable: the bytes behind this URL never change.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (request.headers.get("if-none-match") === etag && !download) return new Response(null, { status: 304, headers: common });

  const stored = await getStorage().get(variantKey(file.storageKey, params.data.variant));
  if (!stored) return NOT_FOUND();

  const original = params.data.variant === "original";
  const filename = original ? file.originalFilename : file.originalFilename.replace(/\.[a-z0-9]{1,5}$/i, "") + ".webp";
  return new Response(stored.body, {
    headers: {
      ...common,
      "Content-Type": original ? file.mimeType : "image/webp",
      ...(stored.size ? { "Content-Length": String(stored.size) } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

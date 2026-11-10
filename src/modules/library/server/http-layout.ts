import "server-only";
import { z } from "zod";
import { withUser } from "@/infrastructure/db/with-user";
import { isSameOrigin } from "@/infrastructure/http/same-origin";
import { getCurrentUser } from "@/modules/auth/server/session";
import { LibraryError } from "../domain/errors";
import { layoutSaveSchema } from "../domain/moodboard";
import { saveLayout } from "./moodboard-repository";
import { UploadError, readLimitedBody } from "./upload";

const MAX_LAYOUT_BYTES = 2 * 1024 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * PUT /api/library/moodboards/<id>/layout
 * Body: { baseVersion, background, elements[] } — the whole layout.
 *
 * 200 { version, dropped }   saved; `dropped` lists elements whose image was deleted meanwhile
 * 409 { version }            the board changed since baseVersion; nothing was written
 * 404                        not found or not visible
 *
 * A route handler rather than a Server Action because autosave must not queue
 * behind (or hold up) other actions, which Next.js runs one at a time per
 * client, and because the editor flushes with `fetch(..., { keepalive: true })`
 * when the page is being closed.
 */
export async function handleLayoutSave(request: Request, moodboardId: string): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { message: "Cross-site requests are not allowed." });
  const user = await getCurrentUser();
  if (!user) return json(401, { message: "Your session has ended. Sign in again to keep saving." });
  if (!z.uuid().safeParse(moodboardId).success) return json(404, { message: "This moodboard no longer exists." });

  let payload: unknown;
  try {
    const bytes = await readLimitedBody(request.body, MAX_LAYOUT_BYTES);
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof UploadError && error.status === 413) return json(413, { message: "This board is too large to save." });
    return json(400, { message: "The layout could not be read." });
  }

  const parsed = layoutSaveSchema.safeParse(payload);
  if (!parsed.success) return json(422, { message: parsed.error.issues[0]?.message ?? "The layout is not valid." });

  try {
    const result = await withUser(user.id, (db) => saveLayout(db, moodboardId, parsed.data));
    if (result.status === "not_found") return json(404, { message: "This moodboard no longer exists, or you don’t have access to it." });
    if (result.status === "conflict") {
      return json(409, { version: result.version, message: "This board was changed somewhere else since you opened it." });
    }
    return json(200, { version: result.version, dropped: result.dropped });
  } catch (error) {
    if (error instanceof LibraryError) return json(422, { message: error.message });
    console.error("[library] layout save failed", error);
    return json(500, { message: "The layout could not be saved." });
  }
}

import "server-only";
import { z } from "zod";
import { isSameOrigin } from "@/infrastructure/http/same-origin";
import { getCurrentUser } from "@/modules/auth/server/session";
import { MAX_UPLOAD_BYTES } from "../domain/files";
import { UploadError, ingestUpload, readLimitedBody } from "./upload";

/**
 * POST /api/library/uploads?workspace=<id>[&collection=<id>][&project=<id>]
 * Body: the raw image bytes. Header `X-File-Name`: the URI-encoded original filename.
 *
 * A route handler rather than a Server Action: the browser needs upload
 * progress (XMLHttpRequest), uploads run several at a time, and actions are
 * capped at 1 MB and dispatched one at a time per client.
 */
export async function handleUploadRequest(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ message: "Cross-site uploads are not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "Your session has ended. Sign in again to continue." }, { status: 401 });

  const url = new URL(request.url);
  const ids = z
    .object({ workspace: z.uuid(), collection: z.uuid().nullable(), project: z.uuid().nullable() })
    .safeParse({
      workspace: url.searchParams.get("workspace"),
      collection: url.searchParams.get("collection"),
      project: url.searchParams.get("project"),
    });
  if (!ids.success) return Response.json({ message: "That workspace no longer exists, or you don’t have access to it." }, { status: 404 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) {
    return Response.json({ message: "This file is larger than the 40 MB limit." }, { status: 413 });
  }

  let filename = "image";
  try {
    filename = decodeURIComponent(request.headers.get("x-file-name") ?? "image");
  } catch {
    // A malformed name is not worth refusing the upload over.
  }

  try {
    const bytes = await readLimitedBody(request.body);
    const result = await ingestUpload({
      userId: user.id,
      workspaceId: ids.data.workspace,
      bytes,
      filename,
      collectionId: ids.data.collection,
      projectId: ids.data.project,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ message: error.message }, { status: error.status });
    console.error("[library] upload failed", error);
    return Response.json({ message: "The upload could not be saved. Try again." }, { status: 500 });
  }
}

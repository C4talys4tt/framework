import "server-only";
import { z } from "zod";
import { withUser } from "@/infrastructure/db/with-user";
import { getCurrentUser } from "@/modules/auth/server/session";
import { decodeCursor, parseLibraryFilters } from "../domain/reference";
import { listReferences } from "./reference-repository";

/**
 * GET /api/library/references?workspace=<id>&<filters>[&cursor=][&project=][&excludeCollection=][&excludeProject=]
 *
 * The next page of a library view, and the source for reference pickers. A GET
 * route so the browser can run it alongside actions and abort it when the
 * filters change mid-request. Row-level security limits it to the caller's
 * workspaces.
 */
export async function handleReferenceList(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "Your session has ended." }, { status: 401 });

  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : values[0]!;
  }
  const ids = z
    .object({
      workspace: z.uuid(),
      project: z.uuid().nullable(),
      excludeCollection: z.uuid().nullable(),
      excludeProject: z.uuid().nullable(),
      limit: z.coerce.number().int().min(1).max(100).nullable(),
    })
    .safeParse({
      workspace: url.searchParams.get("workspace"),
      project: url.searchParams.get("project"),
      excludeCollection: url.searchParams.get("excludeCollection"),
      excludeProject: url.searchParams.get("excludeProject"),
      limit: url.searchParams.get("limit"),
    });
  if (!ids.success) return Response.json({ message: "Not found" }, { status: 404 });

  const page = await withUser(user.id, (db) =>
    listReferences(db, ids.data.workspace, parseLibraryFilters(raw), {
      cursor: decodeCursor(url.searchParams.get("cursor")),
      limit: ids.data.limit ?? undefined,
      projectId: ids.data.project,
      excludeCollection: ids.data.excludeCollection,
      excludeProject: ids.data.excludeProject,
    }),
  );
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}

import { serveReferenceFile } from "@/modules/library/server/http-files";

/** GET /api/library/files/<referenceId>/<thumb|preview|original>: see serveReferenceFile. */
export async function GET(request: Request, context: RouteContext<"/api/library/files/[referenceId]/[variant]">) {
  const { referenceId, variant } = await context.params;
  return serveReferenceFile(request, referenceId, variant);
}

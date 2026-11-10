import { handleLayoutSave } from "@/modules/library/server/http-layout";

/** PUT /api/library/moodboards/<id>/layout: see handleLayoutSave. */
export async function PUT(request: Request, context: RouteContext<"/api/library/moodboards/[moodboardId]/layout">) {
  const { moodboardId } = await context.params;
  return handleLayoutSave(request, moodboardId);
}

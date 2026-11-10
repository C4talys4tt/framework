import { handleReferenceList } from "@/modules/library/server/http-references";

/** GET /api/library/references: see handleReferenceList. */
export async function GET(request: Request) {
  return handleReferenceList(request);
}

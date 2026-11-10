import { handleUploadRequest } from "@/modules/library/server/http-uploads";

/** POST /api/library/uploads: see handleUploadRequest. */
export async function POST(request: Request) {
  return handleUploadRequest(request);
}

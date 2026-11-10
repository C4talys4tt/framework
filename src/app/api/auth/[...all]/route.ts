import { getAuth } from "@/modules/auth/server/auth";

function handle(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };

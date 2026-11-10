import "server-only";
import { getEnv } from "@/infrastructure/env";

/**
 * Route handlers that change data are not covered by the Server Action CSRF
 * check, so they call this. A browser always sends `Origin` on POST/PUT from
 * script; it must be this application. Requests without one are accepted only
 * if the browser says they are same-origin (or it is not a browser at all, in
 * which case there is no ambient session cookie to abuse).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([new URL(getEnv().APP_URL).origin, new URL(request.url).origin]);
    return allowed.has(origin);
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

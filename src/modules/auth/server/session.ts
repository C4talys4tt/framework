import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

/** The narrow view of the signed-in user that the rest of the app may use. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

/** Reads the session once per request. Returns null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

/** For pages: redirects to sign-in (and back to `returnTo` afterwards) when there is no session. */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  return user;
}

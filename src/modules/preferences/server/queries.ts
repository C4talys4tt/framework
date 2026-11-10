import "server-only";
import { cache } from "react";
import { withUser } from "@/infrastructure/db/with-user";
import { requireUser } from "@/modules/auth/server/session";
import type { Preferences } from "../domain/appearance";
import { getPreferences } from "./repository";

export const getMyPreferences = cache(async (): Promise<Preferences> => {
  const user = await requireUser();
  return withUser(user.id, getPreferences);
});

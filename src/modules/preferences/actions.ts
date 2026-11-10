"use server";

import { z } from "zod";
import { withUser } from "@/infrastructure/db/with-user";
import { getCurrentUser } from "@/modules/auth/server/session";
import { fail, invalid, ok, type ActionResult } from "@/shared/lib/action-result";
import { appearanceSchema, type Appearance } from "./domain/appearance";
import { savePreferences } from "./server/repository";

const SIGNED_OUT = "Your session has ended. Sign in again to continue.";

export async function saveAppearanceAction(input: Appearance): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const parsed = appearanceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await withUser(user.id, (db) => savePreferences(db, user.id, parsed.data));
  return ok();
}

export async function saveSidebarCollapsedAction(collapsed: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const parsed = z.boolean().safeParse(collapsed);
  if (!parsed.success) return fail("Invalid sidebar state.");
  await withUser(user.id, (db) => savePreferences(db, user.id, { sidebarCollapsed: parsed.data }));
  return ok();
}

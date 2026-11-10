"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { withUser } from "@/infrastructure/db/with-user";
import { getCurrentUser } from "@/modules/auth/server/session";
import { fail, invalid, ok, type ActionResult } from "@/shared/lib/action-result";
import { workspaceNameSchema } from "./domain/workspace";
import { createWorkspace, renameWorkspace } from "./server/repository";

const SIGNED_OUT = "Your session has ended. Sign in again to continue.";

const createSchema = z.object({ name: workspaceNameSchema });
const renameSchema = z.object({ workspaceId: z.uuid(), name: workspaceNameSchema });

export async function createWorkspaceAction(input: { name: string }): Promise<ActionResult<{ slug: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const workspace = await withUser(user.id, (db) => createWorkspace(db, parsed.data.name));
  return ok({ slug: workspace.slug });
}

export async function renameWorkspaceAction(input: { workspaceId: string; name: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  // RLS decides: the update only matches a workspace this user owns.
  const renamed = await withUser(user.id, (db) => renameWorkspace(db, parsed.data.workspaceId, parsed.data.name));
  if (!renamed) return fail("Only an owner of this workspace can rename it.");
  refresh();
  return ok();
}

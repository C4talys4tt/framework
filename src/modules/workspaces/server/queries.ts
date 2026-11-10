import "server-only";
import { cache } from "react";
import { withUser } from "@/infrastructure/db/with-user";
import { requireUser, type CurrentUser } from "@/modules/auth/server/session";
import {
  personalWorkspaceName,
  workspaceSlugSchema,
  type WorkspaceDetail,
  type WorkspaceSummary,
} from "../domain/workspace";
import { ensurePersonalWorkspace, findWorkspaceBySlug } from "./repository";

/** The signed-in user's workspaces, creating their personal one on first use. */
export const getMyWorkspaces = cache(async (): Promise<{ user: CurrentUser; workspaces: WorkspaceSummary[] }> => {
  const user = await requireUser();
  const workspaces = await withUser(user.id, (db) =>
    ensurePersonalWorkspace(db, user.id, personalWorkspaceName(user.name)),
  );
  return { user, workspaces };
});

export type WorkspaceContext = {
  user: CurrentUser;
  workspace: WorkspaceDetail;
};

/**
 * Resolves a workspace slug for the signed-in user. Returns null when the
 * workspace does not exist or the user is not a member; callers must not
 * distinguish the two.
 */
export const getWorkspaceContext = cache(async (slug: string): Promise<WorkspaceContext | null> => {
  const validSlug = workspaceSlugSchema.safeParse(slug).success;
  const user = await requireUser(validSlug ? `/w/${slug}` : undefined);
  if (!validSlug) return null;
  const workspace = await withUser(user.id, (db) => findWorkspaceBySlug(db, slug));
  return workspace ? { user, workspace } : null;
});

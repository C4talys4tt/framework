import { z } from "zod";

export const WORKSPACE_NAME_MAX_LENGTH = 60;
const SLUG_BASE_MAX_LENGTH = 40;
const SLUG_SUFFIX_LENGTH = 5;
const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type WorkspaceRole = "owner" | "member";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export type WorkspaceDetail = WorkspaceSummary & {
  memberCount: number;
  createdAt: Date;
};

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Give the workspace a name.")
  .max(WORKSPACE_NAME_MAX_LENGTH, `Keep the name under ${WORKSPACE_NAME_MAX_LENGTH} characters.`);

export const workspaceSlugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Lowercase, hyphenated, ASCII-only form of a name. Never empty. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, "");
  return base || "studio";
}

export function randomSlugSuffix(random: () => number = Math.random): string {
  let suffix = "";
  for (let index = 0; index < SLUG_SUFFIX_LENGTH; index += 1) {
    suffix += SLUG_ALPHABET[Math.floor(random() * SLUG_ALPHABET.length)];
  }
  return suffix;
}

/**
 * Slugs are globally unique and always carry a random suffix, so creating a
 * workspace never reveals whether someone else already uses a name.
 */
export function createSlug(name: string, random?: () => number): string {
  return `${slugify(name)}-${randomSlugSuffix(random)}`;
}

export function personalWorkspaceName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0] ?? "";
  if (!first) return "My Studio";
  const possessive = /s$/i.test(first) ? `${first}’` : `${first}’s`;
  return `${possessive} Studio`.slice(0, WORKSPACE_NAME_MAX_LENGTH);
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "owner";
}

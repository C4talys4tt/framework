"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { withUser } from "@/infrastructure/db/with-user";
import { getCurrentUser } from "@/modules/auth/server/session";
import { fail, invalid, ok, type ActionResult } from "@/shared/lib/action-result";
import type { ActivityEntry } from "./domain/activity";
import { ProjectsError } from "./domain/errors";
import {
  categoryInputSchema,
  noteInputSchema,
  projectInputSchema,
  statusInputSchema,
  type ProjectFormValues,
} from "./domain/project";
import { listActivity } from "./server/activity-repository";
import { createNote, deleteNote, setNotePinned, updateNote } from "./server/note-repository";
import {
  createProject,
  getProject,
  setProjectArchived,
  setProjectStatus,
  updateProject,
} from "./server/project-repository";
import {
  createCategory,
  createStatus,
  deleteCategory,
  deleteStatus,
  moveStatus,
  updateCategory,
  updateStatus,
} from "./server/taxonomy-repository";

const SIGNED_OUT = "Your session has ended. Sign in again to continue.";
const NOT_FOUND = "That no longer exists, or you don’t have access to it.";
const OWNERS_ONLY = "Only a workspace owner can change this.";

type User = { id: string };

/**
 * Runs an action body for the signed-in user. Expected domain failures become
 * form-friendly results; anything else is a bug and propagates.
 */
async function act<T>(body: (user: User) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  try {
    return await body(user);
  } catch (error) {
    if (error instanceof ProjectsError) {
      return fail(error.message, error.code === "name_taken" ? { name: error.message } : undefined);
    }
    throw error;
  }
}

const id = z.uuid();

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProjectAction(input: { workspaceId: string; values: ProjectFormValues }): Promise<ActionResult<{ id: string }>> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    if (!workspaceId.success) return fail(NOT_FOUND);
    const parsed = projectInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const projectId = await withUser(user.id, (db) => createProject(db, workspaceId.data, user.id, parsed.data));
    refresh();
    return ok({ id: projectId });
  });
}

export async function updateProjectAction(input: { projectId: string; values: ProjectFormValues }): Promise<ActionResult> {
  return act(async (user) => {
    const projectId = id.safeParse(input.projectId);
    if (!projectId.success) return fail(NOT_FOUND);
    const parsed = projectInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    // RLS decides: a project outside the user's workspaces matches no row.
    const updated = await withUser(user.id, (db) => updateProject(db, projectId.data, parsed.data));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function setProjectStatusAction(input: { projectId: string; statusId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ projectId: id, statusId: id }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const updated = await withUser(user.id, (db) => setProjectStatus(db, parsed.data.projectId, parsed.data.statusId));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

async function archive(projectId: string, archived: boolean): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = id.safeParse(projectId);
    if (!parsed.success) return fail(NOT_FOUND);
    const changed = await withUser(user.id, (db) => setProjectArchived(db, parsed.data, archived));
    if (!changed) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function archiveProjectAction(input: { projectId: string }): Promise<ActionResult> {
  return archive(input.projectId, true);
}

export async function restoreProjectAction(input: { projectId: string }): Promise<ActionResult> {
  return archive(input.projectId, false);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function createNoteAction(input: { projectId: string; title: string; body: string }): Promise<ActionResult> {
  return act(async (user) => {
    const projectId = id.safeParse(input.projectId);
    if (!projectId.success) return fail(NOT_FOUND);
    const parsed = noteInputSchema.safeParse({ title: input.title, body: input.body });
    if (!parsed.success) return invalid(parsed.error);
    const created = await withUser(user.id, (db) => createNote(db, projectId.data, user.id, parsed.data));
    if (!created) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function updateNoteAction(input: { noteId: string; title: string; body: string }): Promise<ActionResult> {
  return act(async (user) => {
    const noteId = id.safeParse(input.noteId);
    if (!noteId.success) return fail(NOT_FOUND);
    const parsed = noteInputSchema.safeParse({ title: input.title, body: input.body });
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateNote(db, noteId.data, parsed.data));
    if (!updated) return fail("Only the author of a note or a workspace owner can edit it.");
    refresh();
    return ok();
  });
}

export async function setNotePinnedAction(input: { noteId: string; pinned: boolean }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ noteId: id, pinned: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const updated = await withUser(user.id, (db) => setNotePinned(db, parsed.data.noteId, parsed.data.pinned));
    if (!updated) return fail("Only the author of a note or a workspace owner can pin it.");
    refresh();
    return ok();
  });
}

export async function deleteNoteAction(input: { noteId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const noteId = id.safeParse(input.noteId);
    if (!noteId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteNote(db, noteId.data));
    if (!deleted) return fail("Only the author of a note or a workspace owner can delete it.");
    refresh();
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export async function loadMoreActivityAction(input: {
  projectId: string;
  before: number;
}): Promise<ActionResult<{ entries: ActivityEntry[]; hasMore: boolean }>> {
  return act(async (user) => {
    const parsed = z.object({ projectId: id, before: z.number().int().positive() }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const page = await withUser(user.id, async (db) => {
      const project = await getProject(db, parsed.data.projectId);
      if (!project) return null;
      return listActivity(db, project.workspaceId, project.id, { before: parsed.data.before });
    });
    return page ? ok(page) : fail(NOT_FOUND);
  });
}

// ---------------------------------------------------------------------------
// Statuses and categories (owners)
// ---------------------------------------------------------------------------

export async function createStatusAction(input: {
  workspaceId: string;
  name: string;
  kind: string;
  color: string;
}): Promise<ActionResult> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    const parsed = statusInputSchema.safeParse(input);
    if (!workspaceId.success) return fail(NOT_FOUND);
    if (!parsed.success) return invalid(parsed.error);
    const created = await withUser(user.id, (db) => createStatus(db, workspaceId.data, parsed.data));
    if (!created) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function updateStatusAction(input: { statusId: string; name: string; kind: string; color: string }): Promise<ActionResult> {
  return act(async (user) => {
    const statusId = id.safeParse(input.statusId);
    const parsed = statusInputSchema.safeParse(input);
    if (!statusId.success) return fail(NOT_FOUND);
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateStatus(db, statusId.data, parsed.data));
    if (!updated) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function deleteStatusAction(input: { statusId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const statusId = id.safeParse(input.statusId);
    if (!statusId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteStatus(db, statusId.data));
    if (!deleted) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function moveStatusAction(input: { statusId: string; direction: "up" | "down" }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ statusId: id, direction: z.enum(["up", "down"]) }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const moved = await withUser(user.id, (db) => moveStatus(db, parsed.data.statusId, parsed.data.direction));
    if (!moved) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function createCategoryAction(input: { workspaceId: string; name: string; color: string }): Promise<ActionResult> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    const parsed = categoryInputSchema.safeParse(input);
    if (!workspaceId.success) return fail(NOT_FOUND);
    if (!parsed.success) return invalid(parsed.error);
    const created = await withUser(user.id, (db) => createCategory(db, workspaceId.data, parsed.data));
    if (!created) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function updateCategoryAction(input: { categoryId: string; name: string; color: string }): Promise<ActionResult> {
  return act(async (user) => {
    const categoryId = id.safeParse(input.categoryId);
    const parsed = categoryInputSchema.safeParse(input);
    if (!categoryId.success) return fail(NOT_FOUND);
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateCategory(db, categoryId.data, parsed.data));
    if (!updated) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

export async function deleteCategoryAction(input: { categoryId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const categoryId = id.safeParse(input.categoryId);
    if (!categoryId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteCategory(db, categoryId.data));
    if (!deleted) return fail(OWNERS_ONLY);
    refresh();
    return ok();
  });
}

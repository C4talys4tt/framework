"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { withUser } from "@/infrastructure/db/with-user";
import { getCurrentUser } from "@/modules/auth/server/session";
import { fail, invalid, ok, type ActionResult } from "@/shared/lib/action-result";
import { LibraryError } from "./domain/errors";
import { moodboardInputSchema, type MoodboardInput } from "./domain/moodboard";
import {
  collectionInputSchema,
  referenceInputSchema,
  tagListSchema,
  tagNameSchema,
  type CollectionInput,
  type ReferenceFormValues,
  type ReferenceUsage,
} from "./domain/reference";
import {
  addToCollection,
  createCollection,
  deleteCollection,
  removeFromCollection,
  setCollectionCover,
  updateCollection,
} from "./server/collection-repository";
import { createMoodboard, deleteMoodboard, duplicateMoodboard, updateMoodboard } from "./server/moodboard-repository";
import {
  addTagToReferences,
  deleteLibraryTag,
  deleteReference,
  getReferenceUsage,
  linkReferencesToProject,
  renameLibraryTag,
  setFavorite,
  setReferenceTags,
  unlinkReferenceFromProject,
  updateReference,
} from "./server/reference-repository";
import { removeStoredFiles } from "./server/upload";

const SIGNED_OUT = "Your session has ended. Sign in again to continue.";
const NOT_FOUND = "That no longer exists, or you don’t have access to it.";
const DELETE_DENIED = "Only the person who added this or a workspace owner can delete it.";

type User = { id: string };

/** Runs an action for the signed-in user. Expected domain failures become results; anything else propagates. */
async function act<T>(body: (user: User) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  try {
    return await body(user);
  } catch (error) {
    if (error instanceof LibraryError) {
      return fail(error.message, error.code === "name_taken" ? { name: error.message } : undefined);
    }
    throw error;
  }
}

const id = z.uuid();
const ids = z.array(z.uuid()).min(1).max(200);

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export async function updateReferenceAction(input: { referenceId: string; values: ReferenceFormValues }): Promise<ActionResult> {
  return act(async (user) => {
    const referenceId = id.safeParse(input.referenceId);
    if (!referenceId.success) return fail(NOT_FOUND);
    const parsed = referenceInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateReference(db, referenceId.data, parsed.data));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function setReferenceTagsAction(input: { referenceId: string; tags: string[] }): Promise<ActionResult> {
  return act(async (user) => {
    const referenceId = id.safeParse(input.referenceId);
    if (!referenceId.success) return fail(NOT_FOUND);
    const parsed = tagListSchema.safeParse(input.tags);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the tags.");
    const updated = await withUser(user.id, (db) => setReferenceTags(db, referenceId.data, parsed.data));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

/**
 * Favorites change often and from busy grids, so by default this does not
 * re-render the page; the caller updates its own state.
 */
export async function setFavoriteAction(input: { referenceId: string; favorite: boolean; refresh?: boolean }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ referenceId: id, favorite: z.boolean(), refresh: z.boolean().optional() }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const done = await withUser(user.id, (db) => setFavorite(db, user.id, parsed.data.referenceId, parsed.data.favorite));
    if (!done) return fail(NOT_FOUND);
    if (parsed.data.refresh) refresh();
    return ok();
  });
}

export async function getReferenceUsageAction(input: { referenceIds: string[] }): Promise<ActionResult<ReferenceUsage>> {
  return act(async (user) => {
    const parsed = ids.safeParse(input.referenceIds);
    if (!parsed.success) return fail(NOT_FOUND);
    const usage = await withUser(user.id, async (db) => {
      const total: ReferenceUsage = { collections: 0, projects: 0, moodboards: 0, placements: 0 };
      for (const referenceId of parsed.data) {
        const one = await getReferenceUsage(db, referenceId);
        total.collections += one.collections;
        total.projects += one.projects;
        total.moodboards += one.moodboards;
        total.placements += one.placements;
      }
      return total;
    });
    return ok(usage);
  });
}

/**
 * Deletes references with everything that points at them (tags, favorites,
 * collection memberships, project links, moodboard placements). All or none:
 * if any one cannot be deleted by this user, nothing is.
 */
export async function deleteReferencesAction(input: { referenceIds: string[] }): Promise<ActionResult<{ deleted: number }>> {
  return act(async (user) => {
    const parsed = ids.safeParse(input.referenceIds);
    if (!parsed.success) return fail(NOT_FOUND);
    const keys = await withUser(user.id, async (db) => {
      const removed: string[] = [];
      for (const referenceId of parsed.data) {
        const key = await deleteReference(db, referenceId);
        if (!key) throw new LibraryError("not_found", parsed.data.length === 1 ? DELETE_DENIED : `Some of these could not be deleted. ${DELETE_DENIED}`);
        removed.push(key);
      }
      return removed;
    });
    // The rows are gone (committed); now the bytes. A failure here only leaves orphaned files.
    await Promise.all(keys.map(removeStoredFiles));
    refresh();
    return ok({ deleted: keys.length });
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function addTagToReferencesAction(input: { workspaceId: string; name: string; referenceIds: string[] }): Promise<ActionResult<{ added: number }>> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    const referenceIds = ids.safeParse(input.referenceIds);
    if (!workspaceId.success || !referenceIds.success) return fail(NOT_FOUND);
    const name = tagNameSchema.safeParse(input.name);
    if (!name.success) return fail(name.error.issues[0]?.message ?? "Check the tag.", { name: name.error.issues[0]?.message ?? "" });
    const added = await withUser(user.id, (db) => addTagToReferences(db, workspaceId.data, name.data, referenceIds.data));
    refresh();
    return ok({ added });
  });
}

export async function renameLibraryTagAction(input: { tagId: string; name: string }): Promise<ActionResult> {
  return act(async (user) => {
    const tagId = id.safeParse(input.tagId);
    if (!tagId.success) return fail(NOT_FOUND);
    const name = tagNameSchema.safeParse(input.name);
    if (!name.success) return fail(name.error.issues[0]?.message ?? "Check the tag.", { name: name.error.issues[0]?.message ?? "" });
    const renamed = await withUser(user.id, (db) => renameLibraryTag(db, tagId.data, name.data));
    if (!renamed) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function deleteLibraryTagAction(input: { tagId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const tagId = id.safeParse(input.tagId);
    if (!tagId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteLibraryTag(db, tagId.data));
    if (!deleted) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function createCollectionAction(input: {
  workspaceId: string;
  values: CollectionInput;
  referenceIds?: string[];
}): Promise<ActionResult<{ id: string }>> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    if (!workspaceId.success) return fail(NOT_FOUND);
    const parsed = collectionInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const initial = input.referenceIds?.length ? ids.safeParse(input.referenceIds) : null;
    if (initial && !initial.success) return fail(NOT_FOUND);
    const collectionId = await withUser(user.id, async (db) => {
      const created = await createCollection(db, workspaceId.data, user.id, parsed.data);
      if (initial?.data) await addToCollection(db, created, initial.data);
      return created;
    });
    refresh();
    return ok({ id: collectionId });
  });
}

export async function updateCollectionAction(input: { collectionId: string; values: CollectionInput }): Promise<ActionResult> {
  return act(async (user) => {
    const collectionId = id.safeParse(input.collectionId);
    if (!collectionId.success) return fail(NOT_FOUND);
    const parsed = collectionInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateCollection(db, collectionId.data, parsed.data));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function deleteCollectionAction(input: { collectionId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const collectionId = id.safeParse(input.collectionId);
    if (!collectionId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteCollection(db, collectionId.data));
    if (!deleted) return fail("Only the person who created this collection or a workspace owner can delete it.");
    refresh();
    return ok();
  });
}

export async function addToCollectionAction(input: { collectionId: string; referenceIds: string[] }): Promise<ActionResult<{ added: number }>> {
  return act(async (user) => {
    const parsed = z.object({ collectionId: id, referenceIds: ids }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const added = await withUser(user.id, (db) => addToCollection(db, parsed.data.collectionId, parsed.data.referenceIds));
    if (added === null) return fail(NOT_FOUND);
    refresh();
    return ok({ added });
  });
}

export async function removeFromCollectionAction(input: { collectionId: string; referenceId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ collectionId: id, referenceId: id }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const removed = await withUser(user.id, (db) => removeFromCollection(db, parsed.data.collectionId, parsed.data.referenceId));
    if (!removed) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function setCollectionCoverAction(input: { collectionId: string; referenceId: string | null }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ collectionId: id, referenceId: id.nullable() }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const done = await withUser(user.id, (db) => setCollectionCover(db, parsed.data.collectionId, parsed.data.referenceId));
    if (!done) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function linkReferencesToProjectAction(input: { projectId: string; referenceIds: string[] }): Promise<ActionResult<{ linked: number }>> {
  return act(async (user) => {
    const parsed = z.object({ projectId: id, referenceIds: ids }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const linked = await withUser(user.id, (db) => linkReferencesToProject(db, parsed.data.projectId, parsed.data.referenceIds));
    refresh();
    return ok({ linked });
  });
}

export async function unlinkReferenceFromProjectAction(input: { projectId: string; referenceId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const parsed = z.object({ projectId: id, referenceId: id }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const removed = await withUser(user.id, (db) => unlinkReferenceFromProject(db, parsed.data.projectId, parsed.data.referenceId));
    if (!removed) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Moodboards
// ---------------------------------------------------------------------------

export async function createMoodboardAction(input: { workspaceId: string; values: MoodboardInput }): Promise<ActionResult<{ id: string }>> {
  return act(async (user) => {
    const workspaceId = id.safeParse(input.workspaceId);
    if (!workspaceId.success) return fail(NOT_FOUND);
    const parsed = moodboardInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const moodboardId = await withUser(user.id, (db) => createMoodboard(db, workspaceId.data, user.id, parsed.data));
    refresh();
    return ok({ id: moodboardId });
  });
}

export async function updateMoodboardAction(input: { moodboardId: string; values: MoodboardInput }): Promise<ActionResult> {
  return act(async (user) => {
    const moodboardId = id.safeParse(input.moodboardId);
    if (!moodboardId.success) return fail(NOT_FOUND);
    const parsed = moodboardInputSchema.safeParse(input.values);
    if (!parsed.success) return invalid(parsed.error);
    const updated = await withUser(user.id, (db) => updateMoodboard(db, moodboardId.data, parsed.data));
    if (!updated) return fail(NOT_FOUND);
    refresh();
    return ok();
  });
}

export async function duplicateMoodboardAction(input: { moodboardId: string }): Promise<ActionResult<{ id: string }>> {
  return act(async (user) => {
    const moodboardId = id.safeParse(input.moodboardId);
    if (!moodboardId.success) return fail(NOT_FOUND);
    const copy = await withUser(user.id, (db) => duplicateMoodboard(db, moodboardId.data, user.id));
    if (!copy) return fail(NOT_FOUND);
    refresh();
    return ok({ id: copy });
  });
}

export async function deleteMoodboardAction(input: { moodboardId: string }): Promise<ActionResult> {
  return act(async (user) => {
    const moodboardId = id.safeParse(input.moodboardId);
    if (!moodboardId.success) return fail(NOT_FOUND);
    const deleted = await withUser(user.id, (db) => deleteMoodboard(db, moodboardId.data));
    if (!deleted) return fail("Only the person who created this moodboard or a workspace owner can delete it.");
    refresh();
    return ok();
  });
}

export async function removeManyFromCollectionAction(input: { collectionId: string; referenceIds: string[] }): Promise<ActionResult<{ removed: number }>> {
  return act(async (user) => {
    const parsed = z.object({ collectionId: id, referenceIds: ids }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const removed = await withUser(user.id, async (db) => {
      let count = 0;
      for (const referenceId of parsed.data.referenceIds) {
        if (await removeFromCollection(db, parsed.data.collectionId, referenceId)) count += 1;
      }
      return count;
    });
    refresh();
    return ok({ removed });
  });
}

export async function unlinkManyFromProjectAction(input: { projectId: string; referenceIds: string[] }): Promise<ActionResult<{ removed: number }>> {
  return act(async (user) => {
    const parsed = z.object({ projectId: id, referenceIds: ids }).safeParse(input);
    if (!parsed.success) return fail(NOT_FOUND);
    const removed = await withUser(user.id, async (db) => {
      let count = 0;
      for (const referenceId of parsed.data.referenceIds) {
        if (await unlinkReferenceFromProject(db, parsed.data.projectId, referenceId)) count += 1;
      }
      return count;
    });
    refresh();
    return ok({ removed });
  });
}

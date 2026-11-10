import "server-only";
import { cache } from "react";
import { withUser } from "@/infrastructure/db/with-user";
import { requireUser } from "@/modules/auth/server/session";
import type { MoodboardDetail, MoodboardSort, MoodboardSummary } from "../domain/moodboard";
import type { CollectionSort, CollectionSummary, LibraryFilters, ReferenceDetail, TagCount } from "../domain/reference";
import { getCollection, listCollectionChoices, listCollections } from "./collection-repository";
import { getMoodboard, listActiveProjects, listMoodboards } from "./moodboard-repository";
import {
  countReferences,
  getReference,
  listLibraryTags,
  listProjectChoices,
  listReferences,
  type ProjectChoice,
  type ReferencePage,
} from "./reference-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getLibraryPage(
  workspaceId: string,
  filters: LibraryFilters,
  options: { projectId?: string } = {},
): Promise<ReferencePage> {
  const user = await requireUser();
  return withUser(user.id, (db) => listReferences(db, workspaceId, filters, options));
}

export const getLibraryCounts = cache(async (workspaceId: string) => {
  const user = await requireUser();
  return withUser(user.id, (db) => countReferences(db, workspaceId));
});

export const getLibraryTags = cache(async (workspaceId: string): Promise<TagCount[]> => {
  const user = await requireUser();
  return withUser(user.id, (db) => listLibraryTags(db, workspaceId));
});

/** One reference, or null when missing or not visible. Callers check the workspace matches the URL. */
export const getReferenceById = cache(async (referenceId: string): Promise<ReferenceDetail | null> => {
  if (!UUID.test(referenceId)) return null;
  const user = await requireUser();
  return withUser(user.id, (db) => getReference(db, referenceId));
});

export async function getCollections(workspaceId: string, options: { q?: string; sort?: CollectionSort } = {}): Promise<CollectionSummary[]> {
  const user = await requireUser();
  return withUser(user.id, (db) => listCollections(db, workspaceId, options));
}

export const getCollectionById = cache(async (collectionId: string) => {
  if (!UUID.test(collectionId)) return null;
  const user = await requireUser();
  return withUser(user.id, (db) => getCollection(db, collectionId));
});

export const getCollectionChoices = cache(async (workspaceId: string) => {
  const user = await requireUser();
  return withUser(user.id, (db) => listCollectionChoices(db, workspaceId));
});

export async function getMoodboards(
  workspaceId: string,
  options: { projectId?: string; q?: string; sort?: MoodboardSort } = {},
): Promise<MoodboardSummary[]> {
  const user = await requireUser();
  return withUser(user.id, (db) => listMoodboards(db, workspaceId, options));
}

export const getMoodboardById = cache(async (moodboardId: string): Promise<MoodboardDetail | null> => {
  if (!UUID.test(moodboardId)) return null;
  const user = await requireUser();
  return withUser(user.id, (db) => getMoodboard(db, moodboardId));
});

export const getProjectChoices = cache(async (workspaceId: string): Promise<ProjectChoice[]> => {
  const user = await requireUser();
  return withUser(user.id, (db) => listProjectChoices(db, workspaceId));
});

export const getActiveProjects = cache(async (workspaceId: string) => {
  const user = await requireUser();
  return withUser(user.id, (db) => listActiveProjects(db, workspaceId));
});

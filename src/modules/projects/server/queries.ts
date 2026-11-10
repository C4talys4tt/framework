import "server-only";
import { cache } from "react";
import { withUser } from "@/infrastructure/db/with-user";
import { requireUser } from "@/modules/auth/server/session";
import type { ActivityEntry } from "../domain/activity";
import type { NoteItem } from "../domain/notes";
import {
  DEFAULT_FILTERS,
  type ProjectCategory,
  type ProjectDetail,
  type ProjectFilters,
  type ProjectListItem,
  type ProjectStatus,
  type TagCount,
} from "../domain/project";
import { listActivity } from "./activity-repository";
import { listNotes } from "./note-repository";
import { getProject, listProjects, listTags, type ProjectPage } from "./project-repository";
import {
  listCategories,
  listCategoriesWithUsage,
  listStatuses,
  listStatusesWithUsage,
  type CategoryWithUsage,
  type StatusWithUsage,
} from "./taxonomy-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectOptions = { statuses: ProjectStatus[]; categories: ProjectCategory[]; tags: TagCount[] };

/** Statuses, categories and tags for forms and filters. Cached per request. */
export const getProjectOptions = cache(async (workspaceId: string): Promise<ProjectOptions> => {
  const user = await requireUser();
  return withUser(user.id, async (db) => ({
    statuses: await listStatuses(db, workspaceId),
    categories: await listCategories(db, workspaceId),
    tags: await listTags(db, workspaceId),
  }));
});

export async function getProjectPage(workspaceId: string, filters: ProjectFilters): Promise<ProjectPage> {
  const user = await requireUser();
  return withUser(user.id, (db) => listProjects(db, workspaceId, filters));
}

/** The most recently updated live projects, for the Overview. */
export const getRecentProjects = cache(async (workspaceId: string): Promise<ProjectListItem[]> => {
  const user = await requireUser();
  const page = await withUser(user.id, (db) => listProjects(db, workspaceId, DEFAULT_FILTERS, { limit: 5 }));
  return page.items;
});

export type ProjectRecord = ProjectDetail & { workspaceId: string };

/**
 * One project by id, or null when it does not exist or is not visible. The
 * caller must still check it belongs to the workspace in the URL.
 */
export const getProjectById = cache(async (projectId: string): Promise<ProjectRecord | null> => {
  if (!UUID.test(projectId)) return null;
  const user = await requireUser();
  return withUser(user.id, (db) => getProject(db, projectId));
});

export async function getProjectNotes(workspaceId: string, projectId: string): Promise<NoteItem[]> {
  const user = await requireUser();
  return withUser(user.id, (db) => listNotes(db, workspaceId, projectId));
}

export async function getProjectActivity(
  workspaceId: string,
  projectId: string,
  before?: number | null,
): Promise<{ entries: ActivityEntry[]; hasMore: boolean }> {
  const user = await requireUser();
  return withUser(user.id, (db) => listActivity(db, workspaceId, projectId, { before }));
}

export async function getTaxonomy(
  workspaceId: string,
): Promise<{ statuses: StatusWithUsage[]; categories: CategoryWithUsage[] }> {
  const user = await requireUser();
  return withUser(user.id, async (db) => ({
    statuses: await listStatusesWithUsage(db, workspaceId),
    categories: await listCategoriesWithUsage(db, workspaceId),
  }));
}

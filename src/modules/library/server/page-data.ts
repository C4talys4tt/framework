import "server-only";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { getCollectionById, getMoodboardById, getReferenceById } from "./queries";

// Each loader resolves a URL under /w/[workspace]/library. The item must exist,
// be visible to the user, AND belong to the workspace in the URL: an item from
// another of the user's workspaces is "not found" here too.

export async function loadLibraryWorkspace(params: Promise<{ workspace: string }>) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  return context;
}

export async function loadReferencePage(params: Promise<{ workspace: string; referenceId: string }>) {
  const { workspace: slug, referenceId } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const reference = await getReferenceById(referenceId);
  if (!reference || reference.workspaceId !== context.workspace.id) notFound();
  return { ...context, reference };
}

export async function loadCollectionPage(params: Promise<{ workspace: string; collectionId: string }>) {
  const { workspace: slug, collectionId } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const collection = await getCollectionById(collectionId);
  if (!collection || collection.workspaceId !== context.workspace.id) notFound();
  return { ...context, collection };
}

export async function loadMoodboardPage(params: Promise<{ workspace: string; moodboardId: string }>) {
  const { workspace: slug, moodboardId } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const moodboard = await getMoodboardById(moodboardId);
  if (!moodboard || moodboard.workspaceId !== context.workspace.id) notFound();
  return { ...context, moodboard };
}

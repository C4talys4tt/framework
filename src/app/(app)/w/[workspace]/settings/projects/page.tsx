import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CategoriesEditor, StatusesEditor } from "@/modules/projects/components/taxonomy-editor";
import { getTaxonomy } from "@/modules/projects/server/queries";
import { SettingsSection } from "@/modules/settings/components/settings-section";
import { SettingsSkeleton } from "@/modules/settings/components/settings-skeleton";
import { canManageWorkspace } from "@/modules/workspaces/domain/workspace";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";

export const metadata: Metadata = { title: "Project settings" };

type Props = { params: Promise<{ workspace: string }> };

export default function ProjectSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ProjectSettings params={params} />
    </Suspense>
  );
}

async function ProjectSettings({ params }: Props) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const { workspace } = context;
  const { statuses, categories } = await getTaxonomy(workspace.id);
  const canManage = canManageWorkspace(workspace.role);

  return (
    <>
      <SettingsSection title="Statuses" description="The stages a project moves through. Order them from first to last.">
        <StatusesEditor workspaceId={workspace.id} statuses={statuses} canManage={canManage} />
      </SettingsSection>
      <SettingsSection title="Categories" description="Group projects by kind of work. Deleting a category keeps its projects.">
        <CategoriesEditor workspaceId={workspace.id} categories={categories} canManage={canManage} />
      </SettingsSection>
    </>
  );
}

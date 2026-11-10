import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SettingsSection } from "@/modules/settings/components/settings-section";
import { SettingsSkeleton } from "@/modules/settings/components/settings-skeleton";
import { WorkspaceForm } from "@/modules/settings/components/workspace-form";
import { canManageWorkspace } from "@/modules/workspaces/domain/workspace";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { LocalDate } from "@/shared/ui/local-date";

export const metadata: Metadata = { title: "Workspace" };

type Props = { params: Promise<{ workspace: string }> };

export default function WorkspaceSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <WorkspaceSettings params={params} />
    </Suspense>
  );
}

async function WorkspaceSettings({ params }: Props) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const { workspace } = context;

  const details = [
    { label: "Address", value: <span className="font-mono text-xs">/w/{workspace.slug}</span> },
    { label: "Your role", value: workspace.role === "owner" ? "Owner" : "Member" },
    { label: "Members", value: workspace.memberCount },
    {
      label: "Created",
      value: <LocalDate value={workspace.createdAt.toISOString()} options={{ day: "numeric", month: "long", year: "numeric" }} />,
    },
  ];

  return (
    <>
      <SettingsSection title="General" description="The name shown in the sidebar and workspace switcher.">
        <WorkspaceForm workspaceId={workspace.id} name={workspace.name} canManage={canManageWorkspace(workspace.role)} />
      </SettingsSection>
      <SettingsSection title="Details" description="Everything in a workspace is visible only to its members.">
        <dl className="flex flex-col">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex min-h-10 items-center justify-between gap-6 border-t border-line-subtle py-2 text-[0.8125rem] first:border-t-0 first:pt-0 last:pb-0"
            >
              <dt className="text-fg-muted">{detail.label}</dt>
              <dd className="truncate font-medium text-fg">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </>
  );
}

import type { ReactNode } from "react";
import { SettingsNav } from "@/modules/settings/components/settings-nav";
import { PageContainer, PageHeader } from "@/shared/ui/page";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer className="flex max-w-4xl flex-col gap-8">
      <PageHeader title="Settings" description="Manage your profile, how FRAMEWORK looks, and this workspace." />
      <SettingsNav />
      <div className="animate-fade-in">{children}</div>
    </PageContainer>
  );
}

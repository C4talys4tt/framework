import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/modules/auth/server/session";
import { ProfileForm } from "@/modules/settings/components/profile-form";
import { SettingsSection } from "@/modules/settings/components/settings-section";
import { SettingsSkeleton } from "@/modules/settings/components/settings-skeleton";

export const metadata: Metadata = { title: "Profile" };

async function ProfileSettings() {
  const user = await requireUser();
  return (
    <SettingsSection title="Profile" description="How you appear across your workspaces.">
      <ProfileForm name={user.name} email={user.email} />
    </SettingsSection>
  );
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ProfileSettings />
    </Suspense>
  );
}

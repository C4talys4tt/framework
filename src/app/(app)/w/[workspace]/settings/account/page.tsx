import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/modules/auth/server/session";
import { ChangePasswordForm } from "@/modules/settings/components/change-password-form";
import { SettingsSection } from "@/modules/settings/components/settings-section";
import { SettingsSkeleton } from "@/modules/settings/components/settings-skeleton";
import { SignOutButton } from "@/modules/settings/components/sign-out-button";

export const metadata: Metadata = { title: "Account" };

async function AccountSettings() {
  const user = await requireUser();
  return (
    <>
      <SettingsSection title="Password" description="Use a long password you do not use anywhere else.">
        <ChangePasswordForm email={user.email} />
      </SettingsSection>
      <SettingsSection title="Session" description={`Signed in as ${user.email}.`}>
        <div className="flex items-center justify-between gap-6">
          <p className="text-[0.8125rem] text-fg-muted">End your session on this device.</p>
          <SignOutButton />
        </div>
      </SettingsSection>
    </>
  );
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <AccountSettings />
    </Suspense>
  );
}

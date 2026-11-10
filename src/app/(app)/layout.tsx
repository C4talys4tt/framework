import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/modules/auth/server/session";
import { PreferencesProvider } from "@/modules/preferences/components/preferences-provider";
import { getMyPreferences } from "@/modules/preferences/server/queries";
import { ShellSkeleton } from "@/modules/shell/components/shell-skeleton";

/**
 * Loads the signed-in user's preferences once for every authenticated route.
 * This layout is shared by all workspaces, so its state survives switching
 * between them.
 */
async function Preferences({ children }: { children: ReactNode }) {
  // Signed-out requests fall through: the workspace layout below redirects
  // them to sign-in and remembers where they were going.
  if (!(await getCurrentUser())) return children;
  return <PreferencesProvider initial={await getMyPreferences()}>{children}</PreferencesProvider>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Preferences>{children}</Preferences>
    </Suspense>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShellSkeleton } from "@/modules/shell/components/shell-skeleton";
import { workspacePath } from "@/modules/shell/navigation";
import { getMyWorkspaces } from "@/modules/workspaces/server/queries";

/** Sends a signed-in user to their first workspace (creating it if needed). */
async function HomeRedirect(): Promise<never> {
  const { workspaces } = await getMyWorkspaces();
  redirect(workspacePath(workspaces[0]!.slug, "overview"));
}

export default function HomePage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <HomeRedirect />
    </Suspense>
  );
}

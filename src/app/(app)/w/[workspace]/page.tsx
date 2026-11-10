import { Suspense } from "react";
import { redirect } from "next/navigation";
import { workspacePath } from "@/modules/shell/navigation";

type Props = { params: Promise<{ workspace: string }> };

async function Redirect({ params }: Props): Promise<never> {
  const { workspace } = await params;
  redirect(workspacePath(workspace, "overview"));
}

export default function WorkspaceIndexPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Redirect params={params} />
    </Suspense>
  );
}

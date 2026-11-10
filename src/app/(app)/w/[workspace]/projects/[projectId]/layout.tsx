import { Suspense, type ReactNode } from "react";
import { ProjectFrame, ProjectFrameSkeleton } from "@/modules/projects/components/project-frame";

type Params = Promise<{ workspace: string; projectId: string }>;

export default function ProjectLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <Suspense fallback={<ProjectFrameSkeleton />}>
      <ProjectFrame params={params}>{children}</ProjectFrame>
    </Suspense>
  );
}

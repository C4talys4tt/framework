import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSectionSkeleton } from "@/modules/projects/components/project-frame";
import { ProjectOverview } from "@/modules/projects/components/project-overview";

export const metadata: Metadata = { title: "Project" };

export default function ProjectOverviewPage({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  return (
    <Suspense fallback={<ProjectSectionSkeleton label="Loading project" />}>
      <ProjectOverview params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectMoodboards } from "@/modules/library/components/project-library";
import { ProjectSectionSkeleton } from "@/modules/projects/components/project-frame";

export const metadata: Metadata = { title: "Project moodboards" };

export default function ProjectMoodboardsPage({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  return (
    <Suspense fallback={<ProjectSectionSkeleton label="Loading moodboards" />}>
      <ProjectMoodboards params={params} />
    </Suspense>
  );
}

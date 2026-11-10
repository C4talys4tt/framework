import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSectionSkeleton } from "@/modules/projects/components/project-frame";
import { ActivitySection } from "@/modules/projects/components/activity-section";

export const metadata: Metadata = { title: "Project activity" };

export default function ProjectActivityPage({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  return (
    <Suspense fallback={<ProjectSectionSkeleton label="Loading activity" />}>
      <ActivitySection params={params} />
    </Suspense>
  );
}

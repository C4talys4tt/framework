import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSectionSkeleton } from "@/modules/projects/components/project-frame";
import { NotesSection } from "@/modules/projects/components/notes-section";

export const metadata: Metadata = { title: "Project notes" };

export default function ProjectNotesPage({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  return (
    <Suspense fallback={<ProjectSectionSkeleton label="Loading notes" />}>
      <NotesSection params={params} />
    </Suspense>
  );
}

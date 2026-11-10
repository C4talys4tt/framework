import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectReferences } from "@/modules/library/components/project-library";
import { UploadProvider } from "@/modules/library/components/upload/upload-provider";
import { ProjectSectionSkeleton } from "@/modules/projects/components/project-frame";

export const metadata: Metadata = { title: "Project references" };

type Props = {
  params: Promise<{ workspace: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ProjectReferencesPage({ params, searchParams }: Props) {
  return (
    <UploadProvider>
      <Suspense fallback={<ProjectSectionSkeleton label="Loading references" />}>
        <ProjectReferences params={params} searchParams={searchParams} />
      </Suspense>
    </UploadProvider>
  );
}

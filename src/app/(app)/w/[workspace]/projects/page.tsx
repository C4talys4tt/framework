import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsSkeleton, ProjectsView } from "@/modules/projects/components/projects-view";

export const metadata: Metadata = { title: "Projects" };

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ProjectsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

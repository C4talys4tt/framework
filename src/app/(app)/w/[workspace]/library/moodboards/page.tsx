import type { Metadata } from "next";
import { Suspense } from "react";
import { MoodboardsSkeleton, MoodboardsView } from "@/modules/library/components/moodboards-view";

export const metadata: Metadata = { title: "Moodboards" };

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function MoodboardsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<MoodboardsSkeleton />}>
      <MoodboardsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { Overview, OverviewSkeleton } from "@/modules/overview/components/overview";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ params }: { params: Promise<{ workspace: string }> }) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

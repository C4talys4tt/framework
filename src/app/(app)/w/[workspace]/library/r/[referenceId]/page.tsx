import type { Metadata } from "next";
import { Suspense } from "react";
import { ReferenceDetailSkeleton, ReferenceDetailView } from "@/modules/library/components/reference-detail";

export const metadata: Metadata = { title: "Reference" };

export default function ReferencePage({ params }: { params: Promise<{ workspace: string; referenceId: string }> }) {
  return (
    <Suspense fallback={<ReferenceDetailSkeleton />}>
      <ReferenceDetailView params={params} />
    </Suspense>
  );
}

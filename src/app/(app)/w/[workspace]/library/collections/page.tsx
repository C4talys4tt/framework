import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionsSkeleton, CollectionsView } from "@/modules/library/components/collections-view";

export const metadata: Metadata = { title: "Collections" };

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CollectionsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<CollectionsSkeleton />}>
      <CollectionsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

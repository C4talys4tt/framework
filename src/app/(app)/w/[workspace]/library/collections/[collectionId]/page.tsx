import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionSkeleton, CollectionView } from "@/modules/library/components/collection-view";

export const metadata: Metadata = { title: "Collection" };

type Props = {
  params: Promise<{ workspace: string; collectionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CollectionPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

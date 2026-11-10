import type { Metadata } from "next";
import { Suspense } from "react";
import { LibrarySkeleton, LibraryView } from "@/modules/library/components/library-view";

export const metadata: Metadata = { title: "Visual Library" };

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function LibraryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

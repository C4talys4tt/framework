import type { Metadata } from "next";
import { Suspense } from "react";
import { MoodboardEditorPage, MoodboardEditorSkeleton } from "@/modules/library/components/editor/moodboard-editor-page";

export const metadata: Metadata = { title: "Moodboard" };

export default function MoodboardPage({ params }: { params: Promise<{ workspace: string; moodboardId: string }> }) {
  return (
    <Suspense fallback={<MoodboardEditorSkeleton />}>
      <MoodboardEditorPage params={params} />
    </Suspense>
  );
}

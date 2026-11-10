import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Wordmark } from "@/shared/ui/wordmark";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <Wordmark />
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs text-fg-faint">404</p>
          <h1 className="text-lg font-semibold tracking-tight">This page is out of frame</h1>
          <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
            It may have moved, or you may not have access to it.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/">Back to your workspace</Link>
        </Button>
      </div>
    </main>
  );
}

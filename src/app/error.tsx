"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { Wordmark } from "@/shared/ui/wordmark";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <Wordmark />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
            The page failed to load. Your work is safe; try again in a moment.
          </p>
          {error.digest ? <p className="font-mono text-xs text-fg-faint">Reference {error.digest}</p> : null}
        </div>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}

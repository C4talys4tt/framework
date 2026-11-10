import { Skeleton } from "@/shared/ui/skeleton";

/** Static placeholder for the shell while the session and workspace resolve. */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas" role="status" aria-label="Loading workspace">
      <div className="hidden w-60 shrink-0 flex-col gap-2 border-r border-line-subtle bg-surface p-2 md:flex">
        <div className="flex h-10 items-center gap-2.5 px-1.5">
          <Skeleton className="size-7" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="mt-2 flex flex-col gap-2 px-2">
          {[72, 56, 88, 64, 48, 80, 60].map((width, index) => (
            <div key={index} className="flex h-6 items-center gap-2.5">
              <Skeleton className="size-4" />
              <Skeleton className="h-2.5" style={{ width }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center border-b border-line-subtle px-5">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-10 md:px-10">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="mt-6 h-28 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

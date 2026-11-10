import { Skeleton } from "@/shared/ui/skeleton";

/** Placeholder for one settings section while its data streams in. */
export function SettingsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-10" role="status" aria-label="Loading settings">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <Skeleton className="h-44 rounded-lg" />
    </div>
  );
}

"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { LocalDate } from "@/shared/ui/local-date";
import { Surface } from "@/shared/ui/surface";
import { loadMoreActivityAction } from "../actions";
import { describeActivity, type ActivityEntry } from "../domain/activity";

export function ActivityTimeline({
  projectId,
  initial,
  hasMore: initialHasMore,
}: {
  projectId: string;
  initial: ActivityEntry[];
  hasMore: boolean;
}) {
  // Fresh server data (after an edit, say) replaces what was loaded; "show older" appends to it.
  const [older, setOlder] = useState<{ base: ActivityEntry[]; entries: ActivityEntry[]; hasMore: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const current = older && older.base === initial ? older : null;
  const entries = current ? [...initial, ...current.entries] : initial;
  const hasMore = current ? current.hasMore : initialHasMore;

  async function loadMore() {
    const last = entries.at(-1);
    if (!last) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await loadMoreActivityAction({ projectId, before: last.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOlder({ base: initial, entries: [...(current?.entries ?? []), ...result.data.entries], hasMore: result.data.hasMore });
    } catch {
      setError("Could not load older activity. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (entries.length === 0) {
    return (
      <Surface>
        <EmptyState icon={<History aria-hidden className="size-4" />} title="No activity yet" description="Changes to this project will be recorded here." />
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Surface>
        <ol aria-label="Activity" className="divide-y divide-line-subtle">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 text-[0.8125rem]">
              <p className="min-w-0 break-words text-fg-muted">
                <span className="font-medium text-fg">{entry.actorName ?? "A former member"}</span> {describeActivity(entry)}
              </p>
              <LocalDate
                value={entry.createdAt}
                options={{ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }}
              />
            </li>
          ))}
        </ol>
      </Surface>
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <div>
          <Button pending={pending} onClick={() => void loadMore()}>
            Show older activity
          </Button>
        </div>
      ) : null}
    </div>
  );
}

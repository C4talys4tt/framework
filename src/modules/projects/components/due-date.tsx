"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/shared/lib/cn";
import { dueState, toLocalIsoDate, type StatusKind } from "../domain/project";
import { CalendarDate } from "./calendar-date";

const subscribe = () => () => undefined;

/**
 * A due date, flagged when it is overdue or close. "Today" is the viewer's own
 * calendar day, which the server cannot know, so the flag appears after hydration.
 */
export function DueDate({
  dueDate,
  statusKind,
  archived,
  empty = "—",
}: {
  dueDate: string | null;
  statusKind: StatusKind;
  archived: boolean;
  empty?: string;
}) {
  const today = useSyncExternalStore(subscribe, () => toLocalIsoDate(new Date()), () => null);
  if (!dueDate) return <span className="text-fg-faint">{empty}</span>;
  const state = today ? dueState(dueDate, today, { statusKind, archived }) : null;
  return (
    <span
      data-due-state={state ?? undefined}
      className={cn("whitespace-nowrap", state === "overdue" && "text-danger", state === "soon" && "text-hue-amber")}
    >
      <CalendarDate value={dueDate} />
      {state === "overdue" ? <span className="ml-1.5 text-xs font-medium">Overdue</span> : null}
      {state === "soon" ? <span className="ml-1.5 text-xs font-medium">Soon</span> : null}
    </span>
  );
}

"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * A calendar date (`YYYY-MM-DD`, no time zone) in the viewer's own locale, to
 * match LocalDate. The date itself is never shifted: it is formatted as UTC.
 * Rendered after hydration, because the server cannot know the viewer's locale.
 */
export function CalendarDate({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      ),
    () => null,
  );
  return text ? <time dateTime={value}>{text}</time> : null;
}

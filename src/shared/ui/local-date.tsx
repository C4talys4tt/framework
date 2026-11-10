"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * Formats a date in the viewer's own locale and time zone. The server cannot
 * know either, so nothing is rendered until the component runs in the browser.
 */
export function LocalDate({ value, options }: { value?: string; options: Intl.DateTimeFormatOptions }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(undefined, options).format(value ? new Date(value) : new Date()),
    () => null,
  );
  return text ? <time dateTime={value}>{text}</time> : null;
}

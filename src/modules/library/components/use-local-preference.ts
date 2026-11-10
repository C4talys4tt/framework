"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
// Used when localStorage is unavailable (private mode, blocked storage), so choices still apply.
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/**
 * A small per-browser preference (a layout choice, a panel state). The server
 * renders `fallback`; the stored value takes over after hydration. Never use
 * this for anything that must persist reliably: that belongs in the database.
 */
export function useLocalPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this view only.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [value, set];
}

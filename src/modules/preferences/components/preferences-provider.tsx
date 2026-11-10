"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { saveAppearanceAction, saveSidebarCollapsedAction } from "../actions";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_COOKIE_MAX_AGE,
  appearanceAttributes,
  serializeAppearance,
  type Appearance,
  type Preferences,
} from "../domain/appearance";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type PreferencesState = {
  appearance: Appearance;
  /** Applies immediately in this browser, then persists to the account. */
  setAppearance: (patch: Partial<Appearance>) => void;
  appearanceStatus: SaveStatus;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

const PreferencesContext = createContext<PreferencesState | null>(null);

/** Writes the appearance to <html> and to the cookie the head script reads. */
function applyToDocument(appearance: Appearance) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(appearanceAttributes(appearance))) {
    root.setAttribute(name, value);
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${APPEARANCE_COOKIE}=${serializeAppearance(appearance)}; Path=/; Max-Age=${APPEARANCE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Holds the signed-in user's preferences for the whole app.
 *
 * It must sit above the workspace layout: Next.js keeps previously visited
 * workspaces mounted (hidden), so state kept per workspace would go stale as
 * soon as a preference changed in another one.
 */
export function PreferencesProvider({ initial, children }: { initial: Preferences; children: ReactNode }) {
  const { sidebarCollapsed: initialCollapsed, ...initialAppearance } = initial;
  const [appearance, setLocalAppearance] = useState<Appearance>(initialAppearance);
  const [appearanceStatus, setAppearanceStatus] = useState<SaveStatus>("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const savedAppearance = useRef<Appearance>(initialAppearance);
  const requestId = useRef(0);

  // The account's saved appearance wins over whatever cookie this browser
  // had, so signing in on a new device picks up the right theme.
  useEffect(() => {
    applyToDocument(savedAppearance.current);
  }, []);

  const setAppearance = useCallback(
    (patch: Partial<Appearance>) => {
      const next = { ...appearance, ...patch };
      const revert = () => {
        setLocalAppearance(savedAppearance.current);
        applyToDocument(savedAppearance.current);
        setAppearanceStatus("error");
      };
      setLocalAppearance(next);
      applyToDocument(next);
      setAppearanceStatus("saving");
      const id = (requestId.current += 1);
      void saveAppearanceAction(next)
        .then((result) => {
          if (id !== requestId.current) return;
          if (!result.ok) return revert();
          savedAppearance.current = next;
          setAppearanceStatus("saved");
        })
        .catch(() => {
          if (id === requestId.current) revert();
        });
    },
    [appearance],
  );

  const toggleSidebar = useCallback(() => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    // Persisting is best-effort: the sidebar still works if the save fails.
    void saveSidebarCollapsedAction(next).catch(() => undefined);
  }, [sidebarCollapsed]);

  const value = useMemo(
    () => ({ appearance, setAppearance, appearanceStatus, sidebarCollapsed, toggleSidebar }),
    [appearance, setAppearance, appearanceStatus, sidebarCollapsed, toggleSidebar],
  );

  return (
    <PreferencesContext value={value}>
      <MotionConfig reducedMotion={appearance.reduceMotion ? "always" : "user"}>{children}</MotionConfig>
    </PreferencesContext>
  );
}

export function usePreferences(): PreferencesState {
  const value = use(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}

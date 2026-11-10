import { z } from "zod";

export const THEMES = ["dark", "light", "system"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export type Appearance = {
  theme: Theme;
  density: Density;
  reduceMotion: boolean;
};

export type Preferences = Appearance & { sidebarCollapsed: boolean };

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  density: "comfortable",
  reduceMotion: false,
};

export const DEFAULT_PREFERENCES: Preferences = { ...DEFAULT_APPEARANCE, sidebarCollapsed: false };

export const appearanceSchema = z.object({
  theme: z.enum(THEMES),
  density: z.enum(DENSITIES),
  reduceMotion: z.boolean(),
});

/**
 * The appearance is mirrored into a cookie so an inline script can apply it to
 * <html> before first paint (see appearance-script.ts). The database row is
 * the source of truth; the cookie is a per-browser cache of it.
 */
export const APPEARANCE_COOKIE = "fw_appearance";
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function serializeAppearance(appearance: Appearance): string {
  return [appearance.theme, appearance.density, appearance.reduceMotion ? "reduce" : "full"].join(".");
}

/** Tolerant parser: unknown or missing parts fall back to defaults. */
export function parseAppearance(value: string | null | undefined): Appearance {
  const [theme, density, motion] = (value ?? "").split(".");
  return {
    theme: THEMES.find((candidate) => candidate === theme) ?? DEFAULT_APPEARANCE.theme,
    density: DENSITIES.find((candidate) => candidate === density) ?? DEFAULT_APPEARANCE.density,
    reduceMotion: motion === "reduce",
  };
}

/** The attributes that carry the appearance on the <html> element. */
export function appearanceAttributes(appearance: Appearance) {
  return {
    "data-theme": appearance.theme,
    "data-density": appearance.density,
    "data-motion": appearance.reduceMotion ? "reduce" : "full",
  } as const;
}

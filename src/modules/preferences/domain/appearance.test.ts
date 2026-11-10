import { describe, expect, it } from "vitest";
import { appearanceScript } from "../appearance-script";
import {
  APPEARANCE_COOKIE,
  DEFAULT_APPEARANCE,
  DENSITIES,
  THEMES,
  appearanceAttributes,
  appearanceSchema,
  parseAppearance,
  serializeAppearance,
  type Appearance,
} from "./appearance";

describe("appearance cookie format", () => {
  it("round-trips every combination", () => {
    for (const theme of THEMES) {
      for (const density of DENSITIES) {
        for (const reduceMotion of [true, false]) {
          const appearance: Appearance = { theme, density, reduceMotion };
          expect(parseAppearance(serializeAppearance(appearance))).toEqual(appearance);
        }
      }
    }
  });

  it("falls back to defaults for missing or tampered values", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("neon.huge.maybe")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("light")).toEqual({ ...DEFAULT_APPEARANCE, theme: "light" });
  });

  it("only accepts known values through the schema", () => {
    expect(appearanceSchema.safeParse({ theme: "dark", density: "compact", reduceMotion: true }).success).toBe(true);
    expect(appearanceSchema.safeParse({ theme: "sepia", density: "compact", reduceMotion: true }).success).toBe(false);
  });
});

describe("appearanceAttributes", () => {
  it("maps onto html data attributes", () => {
    expect(appearanceAttributes({ theme: "system", density: "compact", reduceMotion: true })).toEqual({
      "data-theme": "system",
      "data-density": "compact",
      "data-motion": "reduce",
    });
  });
});

describe("appearanceScript", () => {
  function run(cookie: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const fakeDocument = {
      cookie,
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    };
    new Function("document", appearanceScript)(fakeDocument);
    return attributes;
  }

  it("applies the cookie written by serializeAppearance", () => {
    const appearance: Appearance = { theme: "light", density: "compact", reduceMotion: true };
    const cookie = `other=1; ${APPEARANCE_COOKIE}=${serializeAppearance(appearance)}; last=2`;
    expect(run(cookie)).toEqual(appearanceAttributes(appearance));
  });

  it("leaves the server defaults alone when there is no cookie", () => {
    expect(run("session=abc")).toEqual({});
  });

  it("ignores values that are not on the allow-list", () => {
    expect(run(`${APPEARANCE_COOKIE}=%22onload%3D.compact.full`)).toEqual({
      "data-density": "compact",
      "data-motion": "full",
    });
  });

  it("does not throw on a malformed cookie", () => {
    expect(() => run(`${APPEARANCE_COOKIE}=%E0%A4%A`)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  canManageWorkspace,
  createSlug,
  personalWorkspaceName,
  randomSlugSuffix,
  slugify,
  workspaceNameSchema,
  workspaceSlugSchema,
} from "./workspace";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Northlight Studio")).toBe("northlight-studio");
  });

  it("strips diacritics, apostrophes and punctuation", () => {
    expect(slugify("Zoë’s  Café — VFX!")).toBe("zoes-cafe-vfx");
  });

  it("never returns an empty slug", () => {
    expect(slugify("日本語")).toBe("studio");
    expect(slugify("---")).toBe("studio");
  });

  it("truncates long names without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(39)} bcdef`);
    expect(slug).toBe("a".repeat(39));
  });
});

describe("createSlug", () => {
  it("appends a five character suffix and satisfies the database constraint", () => {
    const slug = createSlug("Enzo’s Studio", () => 0);
    expect(slug).toBe("enzos-studio-aaaaa");
    expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
  });

  it("stays within the slug length limit for the longest allowed name", () => {
    const slug = createSlug("x".repeat(60));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
  });

  it("draws the suffix from a url-safe alphabet", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(randomSlugSuffix()).toMatch(/^[a-z0-9]{5}$/);
    }
  });
});

describe("personalWorkspaceName", () => {
  it("uses the first name", () => {
    expect(personalWorkspaceName("Enzo Marchetti")).toBe("Enzo’s Studio");
  });

  it("handles names ending in s", () => {
    expect(personalWorkspaceName("Iris")).toBe("Iris’ Studio");
  });

  it("falls back when the name is blank", () => {
    expect(personalWorkspaceName("   ")).toBe("My Studio");
  });

  it("always produces a valid workspace name", () => {
    expect(workspaceNameSchema.safeParse(personalWorkspaceName("x".repeat(60))).success).toBe(true);
  });
});

describe("workspaceNameSchema", () => {
  it("trims and accepts ordinary names", () => {
    expect(workspaceNameSchema.parse("  Reel 2027 ")).toBe("Reel 2027");
  });

  it("rejects blank and over-long names", () => {
    expect(workspaceNameSchema.safeParse("   ").success).toBe(false);
    expect(workspaceNameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("canManageWorkspace", () => {
  it("is limited to owners", () => {
    expect(canManageWorkspace("owner")).toBe(true);
    expect(canManageWorkspace("member")).toBe(false);
  });
});

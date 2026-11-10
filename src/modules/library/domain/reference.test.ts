import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  decodeCursor,
  encodeCursor,
  filtersKey,
  filtersToQuery,
  hasActiveFilters,
  parseLibraryFilters,
  referenceInputSchema,
} from "./reference";

const ID = "6f1c2f5e-8f43-4a8e-9b1f-2a4c3d5e6f70";

describe("library filters", () => {
  it("parses the URL, ignoring anything invalid", () => {
    expect(parseLibraryFilters({})).toEqual(DEFAULT_FILTERS);
    expect(
      parseLibraryFilters({ q: "  neon   signs ", tag: ["Night", "night", "rain"], collection: ID, view: "favorites", sort: "title" }),
    ).toEqual({ q: "neon signs", tags: ["Night", "rain"], collection: ID, view: "favorites", sort: "title" });
    expect(parseLibraryFilters({ collection: "not-a-uuid", view: "everything", sort: "random", tag: "" })).toEqual(DEFAULT_FILTERS);
  });

  it("caps the number of tags and the length of the search", () => {
    const parsed = parseLibraryFilters({ tag: Array.from({ length: 20 }, (_, index) => `t${index}`), q: "x".repeat(500) });
    expect(parsed.tags).toHaveLength(8);
    expect(parsed.q).toHaveLength(100);
  });

  it("round-trips through the query string, omitting defaults", () => {
    const filters = { q: "film grain", tags: ["35mm", "night"], collection: ID, view: "recent" as const, sort: "oldest" as const };
    const query = filtersToQuery(filters);
    expect(parseLibraryFilters(Object.fromEntries(groupParams(query)))).toEqual(filters);
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
    expect(filtersToQuery(filters, { collection: true })).not.toContain("collection");
  });

  it("knows when anything narrows the view, and gives equal filters equal keys", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "title" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, tags: ["a"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, collection: ID }, true)).toBe(false);
    expect(filtersKey({ ...DEFAULT_FILTERS, tags: ["B", "a"] })).toBe(filtersKey({ ...DEFAULT_FILTERS, tags: ["a", "b"] }));
    expect(filtersKey({ ...DEFAULT_FILTERS, sort: "title" })).not.toBe(filtersKey(DEFAULT_FILTERS));
  });
});

function groupParams(query: string): [string, string | string[]][] {
  const params = new URLSearchParams(query.slice(1));
  const keys = [...new Set(params.keys())];
  return keys.map((key) => {
    const values = params.getAll(key);
    return [key, values.length > 1 ? values : values[0]!];
  });
}

describe("cursors", () => {
  it("round-trip, including non-ASCII titles", () => {
    const cursor = { value: "café – über", id: ID };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor(encodeCursor({ value: "2026-11-10 08:00:00.123456+00", id: ID }))).toEqual({
      value: "2026-11-10 08:00:00.123456+00",
      id: ID,
    });
  });

  it("reject anything tampered with", () => {
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(encodeCursor({ value: "x", id: "not-a-uuid" }))).toBeNull();
    expect(decodeCursor("a".repeat(1000))).toBeNull();
  });
});

describe("reference input", () => {
  it("trims and normalises a blank link to none", () => {
    expect(referenceInputSchema.parse({ title: "  Key art ", description: "", sourceUrl: "  " })).toEqual({
      title: "Key art",
      description: "",
      sourceUrl: null,
    });
  });

  it("accepts web links only", () => {
    expect(referenceInputSchema.safeParse({ title: "a", description: "", sourceUrl: "https://example.com/a?b=c" }).success).toBe(true);
    expect(referenceInputSchema.safeParse({ title: "a", description: "", sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(referenceInputSchema.safeParse({ title: "a", description: "", sourceUrl: "example.com" }).success).toBe(false);
    expect(referenceInputSchema.safeParse({ title: "", description: "", sourceUrl: "" }).success).toBe(false);
  });
});

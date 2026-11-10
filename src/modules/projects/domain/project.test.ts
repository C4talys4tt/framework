import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  LIMITS,
  PAGE_SIZE,
  dueState,
  filtersToQuery,
  formatCalendarDate,
  hasActiveFilters,
  noteInputSchema,
  normalizeTags,
  pageCount,
  parseProjectFilters,
  projectInputSchema,
  splitTagInput,
  toLocalIsoDate,
} from "./project";

const STATUS_ID = "0b0f0c6e-7f9a-4a4c-8d52-1f1b2f6a7c10";
const CATEGORY_ID = "7d1f6e0a-3b52-4f5e-9d6c-2a9a0c4b5e11";

const valid = {
  name: "  Northlight title sequence ",
  description: "",
  statusId: STATUS_ID,
  categoryId: null,
  client: "",
  priority: "normal" as const,
  startDate: "",
  dueDate: "",
  customFields: [],
  tags: [],
};

describe("projectInputSchema", () => {
  it("accepts a minimal project and trims text", () => {
    const parsed = projectInputSchema.parse(valid);
    expect(parsed.name).toBe("Northlight title sequence");
    expect(parsed.startDate).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  it("requires a name and bounds its length", () => {
    expect(projectInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, name: "x".repeat(LIMITS.projectName + 1) }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, name: "x".repeat(LIMITS.projectName) }).success).toBe(true);
  });

  it("rejects unknown priorities and non-uuid ids", () => {
    expect(projectInputSchema.safeParse({ ...valid, priority: "someday" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, statusId: "not-a-uuid" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, categoryId: CATEGORY_ID }).success).toBe(true);
  });

  it("validates calendar dates, including impossible ones", () => {
    expect(projectInputSchema.safeParse({ ...valid, dueDate: "2026-02-28" }).success).toBe(true);
    expect(projectInputSchema.safeParse({ ...valid, dueDate: "2026-02-30" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, dueDate: "03/05/2026" }).success).toBe(false);
  });

  it("rejects a due date before the start date and reports it on dueDate", () => {
    const result = projectInputSchema.safeParse({ ...valid, startDate: "2026-05-10", dueDate: "2026-05-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["dueDate"]);
    expect(projectInputSchema.safeParse({ ...valid, startDate: "2026-05-01", dueDate: "2026-05-01" }).success).toBe(true);
  });

  it("drops blank custom field rows but rejects half-filled ones", () => {
    const parsed = projectInputSchema.parse({
      ...valid,
      customFields: [
        { key: " Frame rate ", value: "24 fps" },
        { key: "", value: "" },
      ],
    });
    expect(parsed.customFields).toEqual([{ key: "Frame rate", value: "24 fps" }]);
    expect(projectInputSchema.safeParse({ ...valid, customFields: [{ key: "Codec", value: "" }] }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, customFields: [{ key: "", value: "ProRes" }] }).success).toBe(false);
  });

  it("rejects duplicate custom field names regardless of case", () => {
    const result = projectInputSchema.safeParse({
      ...valid,
      customFields: [
        { key: "Codec", value: "ProRes" },
        { key: "codec", value: "H.264" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("limits the number of custom fields", () => {
    const fields = Array.from({ length: LIMITS.fieldsPerProject + 1 }, (_, index) => ({ key: `k${index}`, value: "v" }));
    expect(projectInputSchema.safeParse({ ...valid, customFields: fields }).success).toBe(false);
  });

  it("normalises and de-duplicates tags", () => {
    const parsed = projectInputSchema.parse({ ...valid, tags: ["  Look   dev ", "look dev", "4K", ""] });
    expect(parsed.tags).toEqual(["Look dev", "4K"]);
  });

  it("rejects tags that are too long, contain commas, or are too many", () => {
    expect(projectInputSchema.safeParse({ ...valid, tags: ["x".repeat(LIMITS.tagName + 1)] }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, tags: ["a,b"] }).success).toBe(false);
    const many = Array.from({ length: LIMITS.tagsPerProject + 1 }, (_, index) => `tag${index}`);
    expect(projectInputSchema.safeParse({ ...valid, tags: many }).success).toBe(false);
  });
});

describe("tags", () => {
  it("keeps the first spelling when de-duplicating", () => {
    expect(normalizeTags(["Grade", "grade", "GRADE", "Sound"])).toEqual(["Grade", "Sound"]);
  });

  it("splits typed or pasted text on commas and newlines", () => {
    expect(splitTagInput("grade, 4k\nclient work")).toEqual(["grade", " 4k", "client work"]);
  });
});

describe("noteInputSchema", () => {
  it("requires a body and trims", () => {
    expect(noteInputSchema.safeParse({ title: "", body: "   " }).success).toBe(false);
    expect(noteInputSchema.parse({ title: " Review ", body: " Cut 3 is too long " })).toEqual({
      title: "Review",
      body: "Cut 3 is too long",
    });
  });

  it("bounds title and body", () => {
    expect(noteInputSchema.safeParse({ title: "x".repeat(LIMITS.noteTitle + 1), body: "ok" }).success).toBe(false);
    expect(noteInputSchema.safeParse({ title: "", body: "x".repeat(LIMITS.noteBody + 1) }).success).toBe(false);
  });
});

describe("dueState", () => {
  const active = { statusKind: "active" as const, archived: false };
  it("classifies relative to today", () => {
    expect(dueState("2026-03-01", "2026-03-02", active)).toBe("overdue");
    expect(dueState("2026-03-02", "2026-03-02", active)).toBe("soon");
    expect(dueState("2026-03-05", "2026-03-02", active)).toBe("soon");
    expect(dueState("2026-03-06", "2026-03-02", active)).toBe("later");
  });

  it("never flags finished, archived or undated projects", () => {
    expect(dueState("2020-01-01", "2026-03-02", { statusKind: "done", archived: false })).toBeNull();
    expect(dueState("2020-01-01", "2026-03-02", { statusKind: "active", archived: true })).toBeNull();
    expect(dueState(null, "2026-03-02", active)).toBeNull();
  });

  it("handles month and year boundaries", () => {
    expect(dueState("2027-01-01", "2026-12-31", active)).toBe("soon");
    expect(dueState("2026-12-31", "2027-01-01", active)).toBe("overdue");
  });
});

describe("dates", () => {
  it("formats calendar dates without time-zone drift", () => {
    expect(formatCalendarDate("2026-03-05")).toBe("5 Mar 2026");
    expect(formatCalendarDate("2026-03-05", { year: false })).toBe("5 Mar");
  });

  it("formats a local date as YYYY-MM-DD", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("project filters", () => {
  it("defaults when nothing is given", () => {
    expect(parseProjectFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("reads valid values and takes the first of repeated ones", () => {
    const filters = parseProjectFilters({
      q: ["  title   seq ", "ignored"],
      status: STATUS_ID,
      category: "none",
      tag: "4K",
      sort: "due",
      view: "all",
      page: "3",
    });
    expect(filters).toEqual({ q: "title seq", status: STATUS_ID, category: "none", tag: "4K", sort: "due", view: "all", page: 3 });
  });

  it("falls back instead of throwing on garbage", () => {
    const filters = parseProjectFilters({ status: "x", category: "y", sort: "random", view: "deleted", page: "-4" });
    expect(filters).toEqual(DEFAULT_FILTERS);
    expect(parseProjectFilters({ page: "abc" }).page).toBe(1);
  });

  it("round-trips through the query string and omits defaults", () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
    const filters = { ...DEFAULT_FILTERS, q: "title", sort: "name" as const, view: "archived" as const, page: 2 };
    const query = filtersToQuery(filters);
    expect(query).toBe("?q=title&sort=name&view=archived&page=2");
    expect(parseProjectFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters);
  });

  it("knows when a filter is narrowing the list", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, view: "archived" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "name", page: 2 })).toBe(false);
  });

  it("counts pages", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});

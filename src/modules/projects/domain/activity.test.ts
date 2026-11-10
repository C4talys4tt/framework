import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS, describeActivity, type ActivityKind } from "./activity";

const describe_ = (kind: ActivityKind, data: Record<string, unknown> = {}) => describeActivity({ kind, data });

describe("describeActivity", () => {
  it("describes value changes with before and after", () => {
    expect(describe_("renamed", { from: "Old", to: "New" })).toBe("changed the name from “Old” to “New”");
    expect(describe_("status_changed", { from: "Planning", to: "In progress" })).toBe(
      "changed the status from “Planning” to “In progress”",
    );
  });

  it("handles values being set or cleared", () => {
    expect(describe_("category_changed", { from: null, to: "VFX" })).toBe("set the category to “VFX”");
    expect(describe_("category_changed", { from: "VFX", to: null })).toBe("cleared the category (was “VFX”)");
    expect(describe_("client_changed", { from: "", to: "Acme" })).toBe("set the client to “Acme”");
  });

  it("formats priorities and dates for people", () => {
    expect(describe_("priority_changed", { from: "normal", to: "urgent" })).toBe("changed the priority from normal to urgent");
    expect(describe_("due_date_changed", { from: "2026-03-05", to: "2026-04-01" })).toBe(
      "changed the due date from 5 Mar 2026 to 1 Apr 2026",
    );
    expect(describe_("start_date_changed", { from: "2026-03-05", to: null })).toBe("cleared the start date (was 5 Mar 2026)");
  });

  it("summarises custom field changes", () => {
    expect(describe_("fields_changed", { added: ["Codec"], changed: ["Frame rate"], removed: ["Old"] })).toBe(
      "added “Codec”, changed “Frame rate”, removed “Old” in the details",
    );
    expect(describe_("fields_changed", {})).toBe("edited the details");
  });

  it("describes tags, notes and archiving", () => {
    expect(describe_("tag_added", { tag: "4K" })).toBe("added the tag “4K”");
    expect(describe_("tag_removed", { tag: "4K" })).toBe("removed the tag “4K”");
    expect(describe_("note_added", { title: "Review" })).toBe("added a note “Review”");
    expect(describe_("note_deleted", {})).toBe("deleted a note");
    expect(describe_("archived")).toBe("archived the project");
    expect(describe_("restored")).toBe("restored the project");
  });

  it("tolerates malformed data", () => {
    expect(describe_("renamed", { from: 4, to: {} })).toBe("updated the name");
    expect(describe_("fields_changed", { added: "nope" })).toBe("edited the details");
  });

  it("covers every kind the database can record", () => {
    for (const kind of ACTIVITY_KINDS) expect(describe_(kind).length).toBeGreaterThan(0);
  });
});

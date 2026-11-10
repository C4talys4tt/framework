import { describe, expect, it } from "vitest";
import { MODULES, SETTINGS_SECTIONS, describeLocation, isAvailable, unavailableLabel, workspacePath } from "./navigation";

describe("module registry", () => {
  it("lists the eight product modules with unique ids", () => {
    expect(MODULES.map((module) => module.label)).toEqual([
      "Overview",
      "Projects",
      "Visual Library",
      "Production",
      "Assets",
      "Effects Lab",
      "Journal",
      "Archive",
    ]);
    expect(new Set(MODULES.map((module) => module.id)).size).toBe(MODULES.length);
  });

  it("only gives a route to modules that are available", () => {
    for (const entry of MODULES) {
      if (entry.status === "available") expect(entry.segment).toMatch(/^[a-z-]+$/);
      else expect(entry.segment).toBeNull();
    }
  });

  it("exposes only Overview in M1", () => {
    expect(MODULES.filter(isAvailable).map((module) => module.id)).toEqual(["overview"]);
  });

  it("explains unavailable modules, with the milestone when known", () => {
    const projects = MODULES.find((module) => module.id === "projects")!;
    const archive = MODULES.find((module) => module.id === "archive")!;
    expect(unavailableLabel(projects)).toBe("Projects is not available yet. Planned for milestone 2.");
    expect(unavailableLabel(archive)).toBe("Archive is not available yet.");
  });
});

describe("workspacePath", () => {
  it("builds paths under /w", () => {
    expect(workspacePath("studio-abc12")).toBe("/w/studio-abc12");
    expect(workspacePath("studio-abc12", "settings", "profile")).toBe("/w/studio-abc12/settings/profile");
  });
});

describe("describeLocation", () => {
  it("names module pages", () => {
    expect(describeLocation("/w/studio-abc12/overview")).toEqual(["Overview"]);
  });

  it("names settings sections", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(describeLocation(`/w/studio-abc12/settings/${section.id}`)).toEqual(["Settings", section.label]);
    }
    expect(describeLocation("/w/studio-abc12/settings")).toEqual(["Settings"]);
  });

  it("returns nothing for unknown locations", () => {
    expect(describeLocation("/w/studio-abc12/projects")).toEqual([]);
    expect(describeLocation("/sign-in")).toEqual([]);
  });
});

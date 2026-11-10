import { describe, expect, it } from "vitest";
import { initialsOf } from "./avatar";

describe("initialsOf", () => {
  it("uses the first and last word", () => {
    expect(initialsOf("Enzo Marchetti")).toBe("EM");
    expect(initialsOf("ada king lovelace")).toBe("AL");
  });

  it("handles single names, extra whitespace and emoji", () => {
    expect(initialsOf("  Prince ")).toBe("P");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("🎬 Studio")).toBe("🎬S");
  });
});

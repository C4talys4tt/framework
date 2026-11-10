import { describe, expect, it } from "vitest";
import { matchGoToTarget, matchModifierShortcut, startsGoToSequence, type KeyLike } from "./shortcuts";

function key(value: string, modifiers: Partial<KeyLike> = {}): KeyLike {
  return { key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers };
}

describe("matchModifierShortcut", () => {
  it("opens the palette with ⌘K and Ctrl+K", () => {
    expect(matchModifierShortcut(key("k", { metaKey: true }))).toBe("toggle-palette");
    expect(matchModifierShortcut(key("K", { ctrlKey: true }))).toBe("toggle-palette");
  });

  it("toggles the sidebar with ⌘B and Ctrl+B", () => {
    expect(matchModifierShortcut(key("b", { metaKey: true }))).toBe("toggle-sidebar");
    expect(matchModifierShortcut(key("b", { ctrlKey: true }))).toBe("toggle-sidebar");
  });

  it("ignores plain keys and other modifier combinations", () => {
    expect(matchModifierShortcut(key("k"))).toBeNull();
    expect(matchModifierShortcut(key("k", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(matchModifierShortcut(key("k", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(matchModifierShortcut(key("p", { ctrlKey: true }))).toBeNull();
  });
});

describe("go-to sequences", () => {
  it("start with a plain G", () => {
    expect(startsGoToSequence(key("g"))).toBe(true);
    expect(startsGoToSequence(key("G", { shiftKey: true }))).toBe(true);
    expect(startsGoToSequence(key("g", { ctrlKey: true }))).toBe(false);
    expect(startsGoToSequence(key("o"))).toBe(false);
  });

  it("resolve the second key", () => {
    expect(matchGoToTarget(key("o"))).toBe("go-overview");
    expect(matchGoToTarget(key("p"))).toBe("go-projects");
    expect(matchGoToTarget(key("l"))).toBe("go-library");
    expect(matchGoToTarget(key("s"))).toBe("go-settings");
    expect(matchGoToTarget(key("x"))).toBeNull();
    expect(matchGoToTarget(key("o", { metaKey: true }))).toBeNull();
  });
});

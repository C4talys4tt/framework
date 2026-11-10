/** Keyboard shortcut logic, kept free of React so it can be unit tested. */

export type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type ShortcutCommand = "toggle-palette" | "toggle-sidebar" | "go-overview" | "go-projects" | "go-settings";

export const GO_TO_PREFIX = "g";
export const SEQUENCE_TIMEOUT_MS = 1200;

const GO_TO_TARGETS: Record<string, ShortcutCommand> = {
  o: "go-overview",
  p: "go-projects",
  s: "go-settings",
};

/** Ctrl/⌘ shortcuts. These work everywhere, including inside text fields. */
export function matchModifierShortcut(event: KeyLike): ShortcutCommand | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.altKey || event.shiftKey) return null;
  const key = event.key.toLowerCase();
  if (key === "k") return "toggle-palette";
  if (key === "b") return "toggle-sidebar";
  return null;
}

function isPlainKey(event: KeyLike): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function startsGoToSequence(event: KeyLike): boolean {
  return isPlainKey(event) && event.key.toLowerCase() === GO_TO_PREFIX;
}

/** The second key of a "G then …" sequence. */
export function matchGoToTarget(event: KeyLike): ShortcutCommand | null {
  if (!isPlainKey(event)) return null;
  return GO_TO_TARGETS[event.key.toLowerCase()] ?? null;
}

/** Single-key shortcuts must not fire while someone is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches("input, textarea, select, [role='textbox'], [role='combobox']");
}

import { z } from "zod";

export const BOARD_LIMITS = {
  name: 120,
  description: 2000,
  elements: 1000,
  text: 5000,
  coordinate: 1_000_000,
  size: 100_000,
} as const;

/** Canvas backgrounds offered as swatches; any hex colour is accepted. */
export const BACKGROUNDS = [
  { value: "#0c0e11", label: "Charcoal" },
  { value: "#15181c", label: "Graphite" },
  { value: "#1d2127", label: "Slate" },
  { value: "#f3f1ec", label: "Paper" },
  { value: "#ffffff", label: "White" },
  { value: "#0f1a24", label: "Midnight" },
] as const;
export const DEFAULT_BACKGROUND = BACKGROUNDS[0].value;

export const TEXT_COLORS = ["#e9ebee", "#9ba2ac", "#a5d8f6", "#e8c26a", "#f2938a", "#14181d"] as const;
export const FONT_SIZES = [14, 18, 24, 32, 48, 64, 96] as const;

export type TextStyle = {
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  weight: "regular" | "medium" | "bold";
};
export const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 24, color: "#e9ebee", align: "left", weight: "medium" };

export type ImageElement = {
  id: string;
  kind: "image";
  referenceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

export type TextElement = {
  id: string;
  kind: "text";
  text: string;
  style: TextStyle;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

export type BoardElement = ImageElement | TextElement;

/** What a layout save persists: everything undo/redo can change. */
export type BoardDocument = { background: string; elements: BoardElement[] };

/** Display facts for an image element's reference (not saved with the layout). */
export type BoardImage = { id: string; title: string; width: number; height: number; dominantColor: string };

export type MoodboardSummary = {
  id: string;
  name: string;
  description: string;
  background: string;
  project: { id: string; name: string } | null;
  elementCount: number;
  /** Up to four references shown on the card. */
  previews: { id: string; dominantColor: string }[];
  updatedAt: string;
  canDelete: boolean;
};

export type MoodboardDetail = MoodboardSummary & {
  workspaceId: string;
  version: number;
  document: BoardDocument;
  images: Record<string, BoardImage>;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const hex = z.string().regex(/^#[0-9a-f]{6}$/, "Use a colour like #1a1d22.");
const coordinate = z.number().finite().min(-BOARD_LIMITS.coordinate).max(BOARD_LIMITS.coordinate);
const size = z.number().finite().gt(0).max(BOARD_LIMITS.size);
const z_ = z.number().int().min(-1_000_000).max(1_000_000);

const textStyleSchema = z.object({
  fontSize: z.number().int().min(8).max(400),
  color: hex,
  align: z.enum(["left", "center", "right"]),
  weight: z.enum(["regular", "medium", "bold"]),
});

const imageElementSchema = z.object({
  id: z.uuid(),
  kind: z.literal("image"),
  referenceId: z.uuid(),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  z: z_,
});

const textElementSchema = z.object({
  id: z.uuid(),
  kind: z.literal("text"),
  text: z.string().max(BOARD_LIMITS.text),
  style: textStyleSchema,
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  z: z_,
});

export const boardElementSchema = z.discriminatedUnion("kind", [imageElementSchema, textElementSchema]);

export const layoutSaveSchema = z.object({
  baseVersion: z.number().int().positive(),
  background: hex,
  elements: z
    .array(boardElementSchema)
    .max(BOARD_LIMITS.elements, `A board can hold at most ${BOARD_LIMITS.elements} items.`)
    .refine((elements) => new Set(elements.map((element) => element.id)).size === elements.length, "Duplicate element ids."),
});
export type LayoutSave = z.infer<typeof layoutSaveSchema>;

export const moodboardInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the moodboard a name.")
    .max(BOARD_LIMITS.name, `Keep the name under ${BOARD_LIMITS.name} characters.`),
  description: z.string().trim().max(BOARD_LIMITS.description, `Keep the description under ${BOARD_LIMITS.description} characters.`),
  projectId: z.uuid().nullable(),
});
export type MoodboardInput = z.infer<typeof moodboardInputSchema>;

export const MOODBOARD_SORTS = ["updated", "name", "created"] as const;
export type MoodboardSort = (typeof MOODBOARD_SORTS)[number];

/**
 * True when two documents would save the same thing. Cheap in the common case:
 * edits replace only the elements they change, so most comparisons are by identity.
 */
export function sameDocument(a: BoardDocument, b: BoardDocument): boolean {
  if (a === b) return true;
  if (a.background !== b.background || a.elements.length !== b.elements.length) return false;
  for (let index = 0; index < a.elements.length; index += 1) {
    const left = a.elements[index];
    const right = b.elements[index];
    if (left !== right && JSON.stringify(left) !== JSON.stringify(right)) return false;
  }
  return true;
}

/**
 * What may be uploaded, and how to tell what a file really is. Pure: shared by
 * the browser (early feedback) and the server (the check that counts).
 */

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/tiff"] as const;
export type ImageType = (typeof ACCEPTED_TYPES)[number];

export const TYPE_LABEL: Record<ImageType, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/avif": "AVIF",
  "image/tiff": "TIFF",
};

/** For the file picker. Extensions too, because some systems report no type for AVIF or TIFF. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_TYPES, ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".tif", ".tiff"].join(",");

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
/** Decoding limit (about 12000 x 10000). Protects the server from decompression bombs. */
export const MAX_INPUT_PIXELS = 120_000_000;
export const MAX_FILES_PER_BATCH = 50;

export const VARIANTS = ["thumb", "preview", "original"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isAcceptedType(type: string): type is ImageType {
  return (ACCEPTED_TYPES as readonly string[]).includes(type);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** Identifies an accepted image format from its first bytes; null for anything else (including SVG). */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  // ISO-BMFF: size(4) "ftyp" brand(4). AVIF only; HEIC needs codecs we do not ship.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/** Makes a client-supplied filename safe to store and show: no paths, control characters or excess length. */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  const limited = cleaned.length > 255 ? cleaned.slice(cleaned.length - 255) : cleaned;
  return limited || "image";
}

/** "IMG_2041 final-v2.jpg" -> "IMG_2041 final-v2". Used as the default title. */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[a-z0-9]{1,5}$/i, "");
  const spaced = withoutExtension.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const title = spaced || "Untitled reference";
  return title.length > 200 ? title.slice(0, 200).trim() : title;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** An explanation for a file that the browser can already tell will be refused. */
export function precheckFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const knownExtension = extension ? ["jpg", "jpeg", "png", "webp", "gif", "avif", "tif", "tiff"].includes(extension) : false;
  if (file.type && !isAcceptedType(file.type) && !knownExtension) {
    if (file.type === "image/svg+xml") return "SVG files are not supported. Export a PNG instead.";
    if (file.type === "image/heic" || file.type === "image/heif") return "HEIC photos are not supported yet. Export a JPEG instead.";
    return "Only JPEG, PNG, WebP, GIF, AVIF and TIFF images can be added.";
  }
  return null;
}

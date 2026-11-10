import { createHash } from "node:crypto";
import exifReader from "exif-reader";
import sharp, { type Metadata } from "sharp";
import { MAX_INPUT_PIXELS } from "../domain/files";
import type { ReferenceMetadata } from "../domain/reference";

export type ProcessedImage = {
  /** Dimensions as displayed, i.e. after applying EXIF orientation. */
  width: number;
  height: number;
  dominantColor: string;
  sha256: string;
  metadata: ReferenceMetadata;
  /** WebP derivatives, auto-rotated, converted to sRGB, with all metadata (including GPS) stripped. */
  preview: Uint8Array;
  thumb: Uint8Array;
};

export class UnreadableImageError extends Error {
  constructor(message = "This file could not be read as an image. It may be damaged or in an unusual format.") {
    super(message);
    this.name = "UnreadableImageError";
  }
}

const PREVIEW_MAX = 2048;
const THUMB_WIDTH = 640;
const THUMB_MAX_HEIGHT = 1600;

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function fraction(value: number): string {
  if (value >= 1) return `${Number(value.toFixed(1))}s`;
  return `1/${Math.round(1 / value)}s`;
}

/** Camera facts worth showing. Location (GPS) and serial numbers are deliberately not kept. */
function readExif(buffer: Buffer | undefined): Partial<ReferenceMetadata> {
  if (!buffer) return {};
  try {
    const exif = exifReader(buffer);
    const result: Partial<ReferenceMetadata> = {};
    const make = typeof exif.Image?.Make === "string" ? exif.Image.Make.trim() : "";
    const model = typeof exif.Image?.Model === "string" ? exif.Image.Model.trim() : "";
    const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(" ");
    if (camera) result.camera = camera.slice(0, 80);
    const lens = exif.Photo?.LensModel;
    if (typeof lens === "string" && lens.trim()) result.lens = lens.trim().slice(0, 80);
    const captured = exif.Photo?.DateTimeOriginal;
    if (captured instanceof Date && !Number.isNaN(captured.getTime())) result.capturedAt = captured.toISOString();
    const exposure = exif.Photo?.ExposureTime;
    if (typeof exposure === "number" && exposure > 0) result.exposure = fraction(exposure);
    const aperture = exif.Photo?.FNumber;
    if (typeof aperture === "number" && aperture > 0) result.aperture = `f/${Number(aperture.toFixed(1))}`;
    const iso = exif.Photo?.ISOSpeedRatings;
    const isoValue = Array.isArray(iso) ? iso[0] : iso;
    if (typeof isoValue === "number" && isoValue > 0) result.iso = isoValue;
    const focal = exif.Photo?.FocalLength;
    if (typeof focal === "number" && focal > 0) result.focalLength = `${Number(focal.toFixed(1))} mm`;
    return result;
  } catch {
    // Malformed EXIF is common and never a reason to refuse the image.
    return {};
  }
}

/**
 * Decodes and validates an image, and produces everything stored with it.
 * Throws UnreadableImageError for anything sharp cannot decode, including
 * files whose bytes claim a format they do not contain.
 */
export async function processImage(bytes: Uint8Array): Promise<ProcessedImage> {
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" as const };

  let info: Metadata;
  try {
    info = await sharp(input, options).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit/i.test(message)) {
      throw new UnreadableImageError("This image is too large to process. The limit is about 120 megapixels.");
    }
    throw new UnreadableImageError();
  }
  if (!info.width || !info.height) throw new UnreadableImageError();

  const rotated = (info.orientation ?? 1) >= 5;
  const width = info.autoOrient?.width ?? (rotated ? info.height : info.width);
  const height = info.autoOrient?.height ?? (rotated ? info.width : info.height);
  // For animated images, `height` covers every frame; one frame is pageHeight.
  const frameHeight = info.pages && info.pages > 1 && info.pageHeight ? info.pageHeight : height;

  try {
    const [preview, thumb] = await Promise.all([
      sharp(input, options)
        .rotate()
        .resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84, effort: 4 })
        .toBuffer(),
      sharp(input, options)
        .rotate()
        .resize({ width: THUMB_WIDTH, height: THUMB_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer(),
    ]);
    const stats = await sharp(thumb).stats();
    const dominant = stats.dominant;

    const metadata: ReferenceMetadata = {
      format: info.format,
      space: info.space,
      hasAlpha: info.hasAlpha,
      ...(info.pages && info.pages > 1 ? { animated: true, frames: info.pages } : {}),
      ...(info.density ? { density: info.density } : {}),
      ...readExif(info.exif),
    };

    return {
      width,
      height: rotated ? height : frameHeight,
      dominantColor: `#${hexByte(dominant.r)}${hexByte(dominant.g)}${hexByte(dominant.b)}`,
      sha256: createHash("sha256").update(input).digest("hex"),
      metadata,
      preview: new Uint8Array(preview),
      thumb: new Uint8Array(thumb),
    };
  } catch (error) {
    if (error instanceof UnreadableImageError) throw error;
    // The format was identified from the bytes before this point, so a failure means a damaged file.
    throw new UnreadableImageError();
  }
}

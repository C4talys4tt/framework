import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FilesystemStorage } from "../../src/infrastructure/storage/filesystem";
import { sniffImageType } from "../../src/modules/library/domain/files";
import { UnreadableImageError, processImage } from "../../src/modules/library/server/image-processing";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

describe("image processing (real images)", () => {
  it("reads a JPEG's orientation, camera and capture date, and strips location from derivatives", async () => {
    // 400 x 200 stored, orientation 6 (rotate 90°): displayed as 200 x 400.
    const jpeg = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Make: "FUJIFILM", Model: "X-T5" },
        IFD2: { DateTimeOriginal: "2026:03:14 18:22:05", FNumber: "28/10", ExposureTime: "1/250", ISOSpeedRatings: "400" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
      })
      .toBuffer();
    expect(sniffImageType(jpeg)).toBe("image/jpeg");

    const processed = await processImage(new Uint8Array(jpeg));
    expect({ width: processed.width, height: processed.height }).toEqual({ width: 200, height: 400 });
    expect(processed.metadata).toMatchObject({ format: "jpeg", camera: "FUJIFILM X-T5", aperture: "f/2.8", exposure: "1/250s", iso: 400 });
    expect(processed.metadata.capturedAt).toMatch(/^2026-03-14T/);
    expect(JSON.stringify(processed.metadata)).not.toMatch(/GPS|51/);
    expect(processed.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Red dominates.
    expect(processed.dominantColor).toMatch(/^#[c-f][0-9a-f]/);

    const preview = await sharp(Buffer.from(processed.preview)).metadata();
    expect(preview).toMatchObject({ format: "webp", width: 200, height: 400 });
    expect(preview.exif).toBeUndefined();
    const thumb = await sharp(Buffer.from(processed.thumb)).metadata();
    expect(thumb.format).toBe("webp");
  });

  it("downscales large images and never enlarges small ones", async () => {
    const large = await sharp({ create: { width: 5000, height: 2500, channels: 3, background: "#204060" } }).png().toBuffer();
    const processed = await processImage(new Uint8Array(large));
    expect(await sharp(Buffer.from(processed.preview)).metadata()).toMatchObject({ width: 2048, height: 1024 });
    expect(await sharp(Buffer.from(processed.thumb)).metadata()).toMatchObject({ width: 640, height: 320 });

    const small = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const tiny = await processImage(new Uint8Array(small));
    expect(tiny.metadata.hasAlpha).toBe(true);
    expect(await sharp(Buffer.from(tiny.preview)).metadata()).toMatchObject({ width: 64, height: 48 });
  });

  it("reports animated GIFs by frame size", async () => {
    const frames = 3;
    const gif = await sharp({ create: { width: 30, height: 20 * frames, channels: 3, background: "#ffcc00" } })
      .gif()
      .toBuffer()
      .then((buffer) => sharp(buffer, { pages: -1 }).toBuffer());
    // A strip re-read as a multi-page image:
    const animated = await sharp(gif).metadata();
    const processed = await processImage(new Uint8Array(gif));
    expect(processed.width).toBe(30);
    expect(processed.height).toBe(animated.pageHeight ?? animated.height);
  });

  it("refuses damaged files and files that only look like images", async () => {
    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).jpeg().toBuffer();
    const truncated = new Uint8Array(jpeg.subarray(0, 40));
    await expect(processImage(truncated)).rejects.toBeInstanceOf(UnreadableImageError);
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
    expect(sniffImageType(fake)).toBe("image/png");
    await expect(processImage(fake)).rejects.toBeInstanceOf(UnreadableImageError);
  });
});

describe("filesystem storage", () => {
  let root: string;
  let storage: FilesystemStorage;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "framework-storage-"));
    storage = new FilesystemStorage(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes, reads and deletes objects", async () => {
    const body = new TextEncoder().encode("hello image");
    await storage.put("ws/abc/one/original", body);
    const stored = await storage.get("ws/abc/one/original");
    expect(stored!.size).toBe(body.byteLength);
    expect((await readAll(stored!.body)).toString()).toBe("hello image");

    await storage.delete(["ws/abc/one/original", "ws/abc/missing"]);
    expect(await storage.get("ws/abc/one/original")).toBeNull();
  });

  it("rejects keys that could escape the storage root", async () => {
    for (const key of ["../etc/passwd", "/abs/path", "ws/../../x", "ws//x", "WS/Upper", "ws/x?y"]) {
      await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow(/Invalid storage key|escapes/);
    }
  });
});

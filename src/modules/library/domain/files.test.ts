import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, cleanFilename, formatBytes, precheckFile, sniffImageType, titleFromFilename } from "./files";

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((value) => (typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value])));

describe("sniffImageType", () => {
  it("recognises every accepted format from its signature", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(bytes("GIF87a"))).toBe("image/gif");
    expect(sniffImageType(bytes(0x49, 0x49, 0x2a, 0x00))).toBe("image/tiff");
    expect(sniffImageType(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe("image/tiff");
    expect(sniffImageType(bytes(0, 0, 0, 0x20, "ftypavif"))).toBe("image/avif");
  });

  it("refuses everything else, whatever the file claims to be", () => {
    expect(sniffImageType(bytes("<svg xmlns"))).toBeNull();
    expect(sniffImageType(bytes("<?xml version"))).toBeNull();
    expect(sniffImageType(bytes(0, 0, 0, 0x18, "ftypheic"))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("filenames", () => {
  it("strips paths and control characters and keeps a usable name", () => {
    expect(cleanFilename("C:\\Users\\me\\Desktop\\shot.jpg")).toBe("shot.jpg");
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("bad\u0000name\u001f.png")).toBe("badname.png");
    expect(cleanFilename("   ")).toBe("image");
    expect(cleanFilename(`${"a".repeat(300)}.jpg`)).toHaveLength(255);
    expect(cleanFilename(`${"a".repeat(300)}.jpg`).endsWith(".jpg")).toBe(true);
  });

  it("derives a title from the filename", () => {
    expect(titleFromFilename("IMG_2041 final-v2.jpg")).toBe("IMG 2041 final-v2");
    expect(titleFromFilename(".jpeg")).toBe("Untitled reference");
    expect(titleFromFilename("no-extension")).toBe("no-extension");
  });
});

describe("precheckFile", () => {
  it("explains files the server would refuse", () => {
    expect(precheckFile({ name: "a.jpg", size: 0, type: "image/jpeg" })).toMatch(/empty/);
    expect(precheckFile({ name: "a.jpg", size: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" })).toMatch(/limit/);
    expect(precheckFile({ name: "logo.svg", size: 10, type: "image/svg+xml" })).toMatch(/SVG/);
    expect(precheckFile({ name: "photo.heic", size: 10, type: "image/heic" })).toMatch(/HEIC/);
    expect(precheckFile({ name: "notes.pdf", size: 10, type: "application/pdf" })).toMatch(/Only JPEG/);
  });

  it("lets through accepted types, and known extensions the OS did not label", () => {
    expect(precheckFile({ name: "a.png", size: 10, type: "image/png" })).toBeNull();
    expect(precheckFile({ name: "scan.tif", size: 10, type: "" })).toBeNull();
    expect(precheckFile({ name: "still.avif", size: 10, type: "application/octet-stream" })).toBeNull();
  });
});

describe("formatBytes", () => {
  it("reads naturally", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(40 * 1024 * 1024)).toBe("40 MB");
  });
});

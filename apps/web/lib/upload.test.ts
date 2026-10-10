import { describe, expect, it } from "vitest";
import { checkFile, sniff } from "./upload";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]);

describe("upload validation", () => {
  it("identifies formats by magic bytes, not names", () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(sniff(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniff(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniff(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("rejects empty, oversized and disguised files", async () => {
    expect(await checkFile(new Blob([]))).toEqual({ ok: false, error: "That file is empty." });
    const big = await checkFile(new Blob([bytes(0xff, 0xd8, 0xff)]), 5);
    expect(big.ok).toBe(false);
    const svg = new Blob(["<svg/>"], { type: "image/jpeg" });
    expect(await checkFile(svg)).toMatchObject({ ok: false, error: "Use a JPG/JPEG, PNG or WebP photo." });
    // A real JPEG is accepted whatever the file says it is (.JPG, .jfif, image/jpg, no type).
    for (const type of ["image/jpg", "image/pjpeg", "", "application/octet-stream"]) {
      expect(await checkFile(new File([bytes(0xff, 0xd8, 0xff, 0xe0)], "IMG_0001.JPG", { type }))).toEqual({ ok: true, type: "image/jpeg" });
    }
    expect(await checkFile(new Blob([bytes(0x89, 0x50, 0x4e, 0x47)]))).toEqual({ ok: true, type: "image/png" });
  });
});

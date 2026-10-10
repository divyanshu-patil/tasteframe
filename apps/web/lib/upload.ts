// Client-side photo checks (the API repeats all of them — this is for fast feedback only).

export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedType = (typeof ACCEPTED)[number];
export const MAX_BYTES = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_MB ?? 10) * 1024 * 1024;

/** Identify the real format from magic bytes; extensions and file.type can lie. */
export function sniff(head: Uint8Array): AcceptedType | null {
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  const riff = b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46;
  if (riff && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  return null;
}

export type FileCheck = { ok: true; type: AcceptedType } | { ok: false; error: string };

export async function checkFile(file: Blob, maxBytes = MAX_BYTES): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > maxBytes) {
    return { ok: false, error: `Photos must be ${Math.round(maxBytes / 1048576)} MB or smaller.` };
  }
  const type = sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type) return { ok: false, error: "Use a JPG/JPEG, PNG or WebP photo." };
  return { ok: true, type };
}

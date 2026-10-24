// Pixel size of a downloaded product photo, read from the file header (no image library needed).
// Used to reject thumbnails and banners before the vision verifier is asked about them.
export const MIN_SIDE_PX = 200;
export const MAX_SIDE_PX = 8000;
const MIN_ASPECT = 0.4; // width / height
const MAX_ASPECT = 2.5;

export function imageSize(b: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime === "image/png" && b.length > 24) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (mime === "image/jpeg") {
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; } // standalone markers have no length field
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    if (mime === "image/webp" && b.length > 30 && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
      if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    }
  } catch {
    // truncated header: treated as unreadable below
  }
  return null;
}

/** True when the photo is big enough to print and shaped like a product shot. Unreadable headers fail. */
export function sizeOk(b: Buffer, mime: string): boolean {
  const s = imageSize(b, mime);
  if (!s || s.w < MIN_SIDE_PX || s.h < MIN_SIDE_PX || s.w > MAX_SIDE_PX || s.h > MAX_SIDE_PX) return false;
  const aspect = s.w / s.h;
  return aspect >= MIN_ASPECT && aspect <= MAX_ASPECT;
}

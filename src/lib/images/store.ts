// Local cache of verified product photos: files in public/part-images, index in data/part-images.json.
// Offline demos read from here; nothing is fetched when a part already has an entry.
import "server-only";
import fs from "node:fs";
import path from "node:path";

export type PartImage = { src: string; credit: string; page: string };

const INDEX = path.join(process.cwd(), "data", "part-images.json");
const DIR = path.join(process.cwd(), "public", "part-images");
const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export const imageExt = (mime: string) => EXT[mime];

/** Only entries whose file is on disk, so a stale index never produces a broken image. */
export function readImages(): Record<string, PartImage> {
  try {
    const all: Record<string, PartImage> = JSON.parse(fs.readFileSync(INDEX, "utf8"));
    return Object.fromEntries(Object.entries(all).filter(([, v]) => fs.existsSync(path.join(DIR, path.basename(v.src)))));
  } catch {
    return {};
  }
}

/** `partId` must come from the catalog, never from the request, so it is safe as a file name. */
export function saveImage(partId: string, mime: string, bytes: Buffer, rec: Omit<PartImage, "src">): PartImage {
  fs.mkdirSync(DIR, { recursive: true });
  const name = `${partId}${EXT[mime]}`;
  fs.writeFileSync(path.join(DIR, name), bytes);
  const saved = { ...rec, src: `/part-images/${name}` };
  fs.writeFileSync(INDEX, JSON.stringify({ ...readImages(), [partId]: saved }, null, 2) + "\n"); // drops index entries whose file is gone
  return saved;
}

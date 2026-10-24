// POST /api/part-images { partIds, labels? } -> { images: { [partId]: { src, credit, page } }, labels: { [label]: partId } }
// Real product photos for the manuals, found and checked by Gemini agents (src/lib/images/agents.ts).
import { z } from "zod";
import { loadCatalog } from "@/lib/data";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";
import { findPartImages, matchLabels } from "@/lib/images/agents";
import { readImages } from "@/lib/images/store";

export const maxDuration = 120;

const Body = z.object({
  partIds: z.array(z.string().max(64)).max(12),
  labels: z.array(z.string().max(60)).max(60).default([]),
});

let running = 0; // shortcut: per-process cap instead of a per-IP limit; add real rate limiting before this is public.

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { partIds, labels? }." }, { status: 400 });
  if (running >= 2) return Response.json({ error: "Busy finding photos. Try again in a moment." }, { status: 429 });
  running++;
  try {
    return await run(body.data);
  } finally {
    running--;
  }
}

async function run(data: z.infer<typeof Body>) {
  const known = new Set(data.partIds);
  const parts = loadCatalog().filter((p) => known.has(p.id));
  const live = hasGeminiKey() && !isDemoMode();
  try {
    const stored = readImages();
    const images = live ? await findPartImages(parts) : Object.fromEntries(parts.filter((p) => stored[p.id]).map((p) => [p.id, stored[p.id]]));
    const withPhoto = parts.filter((p) => images[p.id]);
    const labels = live ? await matchLabels(data.labels, withPhoto).catch(() => ({})) : {};
    return Response.json({ images, labels });
  } catch (e) {
    console.error("[part-images]", e);
    return Response.json({ images: {}, labels: {} });
  }
}

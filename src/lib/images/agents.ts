// Agents that find a real product photo for each catalog part, for the build manuals.
//   1. Page agent (code): reads the vendor page's og:image / JSON-LD image.
//   2. Search agent (Gemini + Google Search): proposes image URLs when the page gives none.
//   3. Verifier agent (Gemini vision): looks at each candidate and rejects wrong, tiny or watermarked pictures.
//   4. Label agent (Gemini): maps manual parts-box labels ("Raspberry Pi 5") to catalog parts.
import "server-only";
import { z } from "zod";
import type { Part } from "../contracts";
import { generateWithFallback, getGemini, geminiTimeout, parseJsonText } from "../gemini";
import { MODELS } from "../models";
import { imageExt, readImages, saveImage, type PartImage } from "./store";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const MAX_BYTES = 3_000_000;
const MAX_CANDIDATES = 4;

/** https to a public host only: model-written and page-written URLs must not reach local services. */
export function isPublicHttps(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname;
    return u.protocol === "https:" && u.port === "" && h.includes(".") && !/^[\d.]+$/.test(h) && !h.includes(":") && !/\.(local|internal|localhost|lan)$/i.test(h);
  } catch {
    return false;
  }
}

/** fetch that re-checks every redirect hop. shortcut: no DNS-rebinding guard, fine for a local dev app. */
async function safeFetch(url: string, hops = 3): Promise<Response | null> {
  for (let i = 0; i <= hops; i++) {
    if (!isPublicHttps(url)) return null;
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res) return null;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).href;
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

/** Reads at most `max` bytes; null if the body is bigger, so a huge response cannot exhaust memory. */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (Number(res.headers.get("content-length") ?? 0) > max || !res.body) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += c.length;
    if (size > max) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/* ---------- 1. Page agent ---------- */

export async function pageCandidates(part: Part): Promise<string[]> {
  const res = part.url ? await safeFetch(part.url) : null;
  if (!res) return [];
  const html = (await readCapped(res, 2_000_000))?.toString("utf8") ?? "";
  const found = [
    ...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/gi),
    ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi),
    ...html.matchAll(/"image"\s*:\s*"([^"]+)"/g),
  ].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(found.map((u) => { try { return new URL(u, part.url).href; } catch { return ""; } }).filter(Boolean))];
}

/* ---------- 2. Search agent ---------- */

export async function searchCandidates(part: Part): Promise<string[]> {
  const res = await getGemini().models.generateContent({
    model: MODELS.CATALOG_SCRAPE,
    contents: `Use Google Search to find direct https image URLs (jpg, png or webp) of this exact product, preferably from the vendor's own product page.\nProduct: ${part.name}\nVendor: ${part.vendor}\nProduct page: ${part.url || "(unknown)"}\nReply with only a JSON array of up to 4 URL strings. Never invent a URL; return [] if you cannot find one.`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, abortSignal: geminiTimeout(60_000) },
  });
  const raw = z.array(z.string()).safeParse((() => { try { return parseJsonText(res.text); } catch { return null; } })());
  return raw.success ? raw.data : [];
}

/* ---------- 3. Verifier agent ---------- */

async function download(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const res = await safeFetch(url);
  const mime = res?.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!res || !imageExt(mime)) return null;
  const bytes = await readCapped(res, MAX_BYTES);
  return bytes && bytes.length > 2_000 ? { bytes, mime } : null;
}

const Verdict = z.object({ matches: z.boolean(), reason: z.string() });

async function looksRight(part: Part, img: { bytes: Buffer; mime: string }): Promise<boolean> {
  try {
    const res = await generateWithFallback({
      model: MODELS.GENERATE,
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: img.mime, data: img.bytes.toString("base64") } },
        { text: `Does this photo clearly show this exact product: "${part.name}" (${part.category})? Reject logos, packaging-only shots, a different product, a bundle with other items, heavy watermarks, or tiny thumbnails. Answer as JSON.` },
      ] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: { matches: { type: "boolean" }, reason: { type: "string" } }, required: ["matches", "reason"] },
        temperature: 0,
      },
    }, { primaryTimeoutMs: 25_000, fallbackTimeoutMs: 25_000 });
    const v = Verdict.safeParse(parseJsonText(res.text));
    return v.success && v.data.matches;
  } catch {
    return false; // an unverified photo is never used
  }
}

/* ---------- Orchestration ---------- */

/** Parts with no verified photo are not retried for 10 minutes, so repeat requests cannot re-spend Gemini calls. */
const missedUntil = new Map<string, number>();

export async function findPartImage(part: Part, say: (t: string) => void = () => {}): Promise<PartImage | null> {
  const have = readImages()[part.id];
  if (have) return have;
  if ((missedUntil.get(part.id) ?? 0) > Date.now()) return null;
  const tried = new Set<string>();
  const sources: [string, () => Promise<string[]>][] = [
    ["vendor page", () => pageCandidates(part)],
    ["web search", () => searchCandidates(part)],
  ];
  for (const [label, get] of sources) {
    say(`Photo agent (${label}): looking for ${part.name}…`);
    const urls = (await get().catch(() => [])).filter((u) => !tried.has(u)).slice(0, MAX_CANDIDATES);
    for (const url of urls) {
      tried.add(url);
      const img = await download(url);
      if (!img) continue;
      say(`Photo verifier: checking a picture of ${part.name}…`);
      if (await looksRight(part, img)) {
        return saveImage(part.id, img.mime, img.bytes, { credit: `Photo: ${part.vendor}`, page: part.url || url });
      }
    }
  }
  missedUntil.set(part.id, Date.now() + 10 * 60_000);
  say(`No verified photo for ${part.name}; the manual keeps its placeholder.`);
  return null;
}

/** Runs the photo agents for several parts, a few at a time. */
export async function findPartImages(parts: Part[], say: (t: string) => void = () => {}): Promise<Record<string, PartImage>> {
  const out: Record<string, PartImage> = {};
  const queue = [...parts];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const img = await findPartImage(p, say);
      if (img) out[p.id] = img;
    }
  }));
  return out;
}

/* ---------- 4. Label agent ---------- */

/** Maps parts-box labels to part ids. Labels that are not a catalog part (a laptop, a multimeter) map to nothing. */
export async function matchLabels(labels: string[], parts: Part[]): Promise<Record<string, string>> {
  if (!labels.length || !parts.length) return {};
  const ids = parts.map((p) => p.id);
  const res = await generateWithFallback({
    model: MODELS.CHEAP,
    contents: `Match each label from an assembly manual to the robot part it names, or "none" if it names no part in the list.\nParts:\n${parts.map((p) => `- ${p.id}: ${p.name}`).join("\n")}\nLabels:\n${labels.map((l) => `- ${l}`).join("\n")}`,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: { matches: { type: "array", items: { type: "object", properties: { label: { type: "string" }, partId: { type: "string", enum: [...ids, "none"] } }, required: ["label", "partId"] } } },
        required: ["matches"],
      },
      temperature: 0,
    },
  }, { primaryTimeoutMs: 20_000, fallbackTimeoutMs: 20_000 });
  const parsed = z.object({ matches: z.array(z.object({ label: z.string(), partId: z.string() })) }).safeParse(parseJsonText(res.text));
  const known = new Set(labels);
  return Object.fromEntries((parsed.success ? parsed.data.matches : []).filter((m) => known.has(m.label) && ids.includes(m.partId)).map((m) => [m.label, m.partId]));
}

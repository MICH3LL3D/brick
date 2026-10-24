import type { z } from "zod";
import type { ChatAction, Design, Part, Task } from "./contracts";
import { SAMPLE_MANUALS } from "./manual-sample";
import { ManualSet, type ManualSetT } from "./manual-format";
import { loadCatalog, loadRoom } from "./data";
import { stubResult, type Result, type RoomT } from "./stub";

// shortcut: each call falls back to stub data when the route is missing or fails; drop the fallbacks once /api is live.
async function post<T>(url: string, body: unknown, fallback: () => T): Promise<T> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return fallback();
  }
}

export type GenerateOutcome = { ok: true; result: Result & { task?: unknown } } | { ok: false; error: string };

/** No stub fallback: if the backend did not design a robot, say why instead of showing a fake one. */
export async function generate(prompt: string, budgetUsd: number, onProgress?: (text: string) => void): Promise<GenerateOutcome> {
  let res: Response;
  try {
    // The route stops repairing after ~60 s; give it headroom, then fail visibly instead of spinning.
    res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, budgetUsd, stream: true }), signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    return { ok: false, error: timeoutOr(e, "Couldn’t reach the design service. Check that the app server is running.") };
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    return { ok: false, error: typeof body?.error === "string" ? body.error : `The design service failed (HTTP ${res.status}).` };
  }
  // NDJSON: {"progress"} lines, then one {"result"} or {"error"} line.
  let out: GenerateOutcome = { ok: false, error: "The design service ended without an answer." };
  const read = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (typeof msg.progress === "string") onProgress?.(msg.progress);
    else if (msg.result?.design) out = { ok: true, result: msg.result };
    else if (typeof msg.error === "string") out = { ok: false, error: msg.error };
  };
  try {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      const parts = (buf + r.value).split("\n");
      buf = parts.pop() ?? "";
      parts.forEach(read);
    }
    read(buf);
  } catch (e) {
    return { ok: false, error: timeoutOr(e, "The connection dropped while designing. Please try again.") };
  }
  return out;
}

const timeoutOr = (e: unknown, fallback: string) =>
  e instanceof DOMException && e.name === "TimeoutError" ? "The design took too long. Please try again." : fallback;

export const rebudget = (design: Design, budgetUsd: number) =>
  post<Result>("/api/rebudget", { design, budgetUsd }, () => stubResult(budgetUsd));

// Catalog and room are static JSON, so read them directly; the stub copies used different part ids.
export const getCatalog = async (): Promise<Part[]> => loadCatalog();
export const getRoom = async (): Promise<RoomT> => loadRoom() as RoomT;

export function saveFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadKit(design: Design, name: string): Promise<boolean> {
  try {
    const res = await fetch("/api/kit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ design, task: { prompt: name, targetIds: [] } }) });
    if (!res.ok) return false;
    saveFile(await res.blob(), `${name}.zip`);
    return true;
  } catch {
    return false;
  }
}

export function exportCsv(rows: { robot: string; part: Part; reason?: string }[]) {
  // Leading = + - @ would run as a formula in a spreadsheet, so prefix a quote.
  const q = (s: string | number) => `"${String(s).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const lines = [["robot", "part", "category", "vendor", "price_usd", "verified", "url", "reason"].join(",")];
  for (const { robot, part: p, reason } of rows) lines.push([robot, p.name, p.category, p.vendor, p.priceUsd, p.verified, p.url, reason ?? ""].map((v) => q(v as string | number)).join(","));
  saveFile(new Blob([lines.join("\n")], { type: "text/csv" }), "buy-list.csv");
}

// Manuals: B's POST /api/manual (Gemini writes the words, code adds pins and counts) is not built yet, so this falls back to sample content.
export async function getManuals(design: Design | null, prompt: string): Promise<ManualSetT> {
  const raw = await post<unknown>("/api/manual", { design, task: { prompt, targetIds: [] } }, () => SAMPLE_MANUALS);
  const ok = ManualSet.safeParse(raw);
  return ok.success ? ok.data : SAMPLE_MANUALS;
}

type Photo = { src: string; credit: string };

/**
 * Fills empty art slots in the parts boxes with verified product photos (POST /api/part-images).
 * Slow the first time (agents search and check), instant after. Any failure returns the set unchanged.
 */
export async function attachPartImages(set: ManualSetT, design: Design | null): Promise<ManualSetT> {
  if (!design) return set;
  const labels = new Set<string>();
  for (const b of set.books) for (const pg of b.pages) for (const it of [...pg.parts, ...(pg.kind === "parts" ? pg.items : [])]) if (!it.art) labels.add(it.label);
  try {
    const res = await fetch("/api/part-images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partIds: [...new Set(design.partIds)], labels: [...labels] }), signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return set;
    const { images, labels: map } = (await res.json()) as { images: Record<string, Photo>; labels: Record<string, string> };
    const fill = <T extends { label: string; art?: unknown }>(it: T): T => {
      const img = images[map[it.label]];
      return it.art || !img ? it : { ...it, art: { kind: "photo" as const, src: img.src, credit: img.credit } };
    };
    return { ...set, books: set.books.map((b) => ({ ...b, pages: b.pages.map((pg) => ({ ...pg, parts: pg.parts.map(fill), ...(pg.kind === "parts" ? { items: pg.items.map(fill) } : {}) })) })) } as ManualSetT;
  } catch {
    return set;
  }
}

/** Sprocket in the Build view. Uses POST /api/chat; says so plainly when it can't answer. */
export async function askSprocket(messages: { role: "user" | "assistant"; content: string }[], design: Design | null, prompt: string): Promise<string> {
  if (!design) return "Generate a robot in Design mode first, then I can help with its build.";
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, design, task: { prompt, targetIds: [] } }) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).reply as string;
  } catch {
    return "I can't reach my brain right now. Check the page's SEE tags, or try again in a moment.";
  }
}

export type ChatActionT = z.infer<typeof ChatAction>;
export type OwlMsg = { role: "user" | "assistant"; content: string };
type TaskT = z.infer<typeof Task>;

/** Owl on the robot page. Same POST /api/chat, but returns the actions too. Never throws. */
export async function askOwl(messages: OwlMsg[], design: Design, task: TaskT): Promise<{ reply: string; actions: ChatActionT[]; source: "gemini" | "offline" }> {
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, design, task }) });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    return { reply: String(body.reply ?? ""), actions: Array.isArray(body.actions) ? body.actions : [], source: body.source === "gemini" ? "gemini" : "offline" };
  } catch {
    return { reply: "I can't reach my brain right now. Try again in a moment.", actions: [], source: "offline" };
  }
}

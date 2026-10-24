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
  let msg: { result?: unknown; error?: string };
  try {
    msg = await readNdjson(res, onProgress);
  } catch (e) {
    return { ok: false, error: timeoutOr(e, "The connection dropped while designing. Please try again.") };
  }
  const result = msg.result as { design?: unknown } | undefined;
  if (result?.design) return { ok: true, result: result as never };
  return { ok: false, error: msg.error ?? "The design service ended without an answer." };
}

/** NDJSON from /api/generate and /api/manual: {"progress"} lines, then one {"result"} or {"error"} line. */
async function readNdjson(res: Response, onProgress?: (text: string) => void): Promise<{ result?: unknown; error?: string }> {
  const out: { result?: unknown; error?: string } = {};
  const read = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (typeof msg.progress === "string") onProgress?.(msg.progress);
    else if (msg.result) out.result = msg.result;
    else if (typeof msg.error === "string") out.error = msg.error;
  };
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    const parts = (buf + r.value).split("\n");
    buf = parts.pop() ?? "";
    parts.forEach(read);
  }
  read(buf);
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

/**
 * POST /api/manual (Gemini writer agents + code for pins and counts + photo agents). Streams progress lines while it works.
 * Without a design, or if the route fails or has no Gemini key, the sample manuals are returned so the viewer still works.
 */
export async function getManuals(design: Design | null, prompt: string, onProgress?: (text: string) => void): Promise<ManualSetT> {
  if (!design) return SAMPLE_MANUALS;
  try {
    const res = await fetch("/api/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ design, task: { prompt, targetIds: [] }, stream: true }), signal: AbortSignal.timeout(180_000) });
    if (!res.ok || !res.body) return SAMPLE_MANUALS;
    const { result } = await readNdjson(res, onProgress);
    const ok = ManualSet.safeParse(result);
    return ok.success ? ok.data : SAMPLE_MANUALS;
  } catch {
    return SAMPLE_MANUALS;
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

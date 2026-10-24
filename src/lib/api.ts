import type { Design, Part } from "./contracts";
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
export async function generate(prompt: string, budgetUsd: number): Promise<GenerateOutcome> {
  let res: Response;
  try {
    // The route stops repairing after ~60 s; give it headroom, then fail visibly instead of spinning.
    res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, budgetUsd }), signal: AbortSignal.timeout(90_000) });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return { ok: false, error: timedOut ? "The design took too long. Please try again." : "Couldn’t reach the design service. Check that the app server is running." };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.design) {
    return { ok: false, error: typeof body?.error === "string" ? body.error : `The design service failed (HTTP ${res.status}).` };
  }
  return { ok: true, result: body };
}

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

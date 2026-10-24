import type { Design, Part } from "./contracts";
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

export const generate = (prompt: string, budgetUsd: number) =>
  post<Result & { task?: unknown }>("/api/generate", { prompt, budgetUsd }, () => stubResult(budgetUsd));

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

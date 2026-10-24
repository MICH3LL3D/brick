// Buy list rows and CSV. Pure functions: safe to import from client code too.
import type { Design, Part } from "../contracts";
import { partMap } from "../data";

export type BuyRow = { part: Part; qty: number; lineUsd: number };

/** One row per distinct part; repeated ids in design.partIds become quantity. */
export function buyRows(design: Design, catalog: Part[]): BuyRow[] {
  const byId = partMap(catalog);
  const qty = new Map<string, number>();
  for (const id of design.partIds) if (byId.has(id)) qty.set(id, (qty.get(id) ?? 0) + 1);
  return [...qty].map(([id, n]) => {
    const part = byId.get(id)!;
    return { part, qty: n, lineUsd: Math.round(part.priceUsd * n * 100) / 100 };
  });
}

const cell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Columns: part, vendor, url, price, qty, verified. Prices are from vendor pages at scrape time. */
export function buyListCsv(design: Design, catalog: Part[]): string {
  const rows = buyRows(design, catalog);
  const lines = [["part", "vendor", "url", "price", "qty", "verified"].join(",")];
  for (const r of rows) lines.push([r.part.name, r.part.vendor, r.part.url, r.part.priceUsd.toFixed(2), r.qty, r.part.verified].map(cell).join(","));
  const total = rows.reduce((s, r) => s + r.lineUsd, 0);
  lines.push(["TOTAL", "", "", total.toFixed(2), "", ""].map(cell).join(","));
  return lines.join("\n") + "\n";
}

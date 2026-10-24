// Shared vendor-page helpers for the catalog scripts.

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

/**
 * Pulls the product's own price out of a vendor page. Only structured product markup is used
 * (Open Graph / JSON-LD), never loose "$" text, which also matches related products.
 */
export function extractPrice(html: string): number | null {
  const patterns = [
    /product:price:amount" content="([0-9.]+)"/, // Adafruit, SparkFun (Open Graph)
    /"price":"([0-9.]+)"/,                        // Pololu (JSON-LD)
    /"price":([0-9.]+)[,}]/,                      // DFRobot
  ];
  for (const re of patterns) {
    const all = [...html.matchAll(new RegExp(re, "g"))].map((m) => Number(m[1]));
    if (all.length === 0) continue;
    if (new Set(all).size > 1) console.warn(`  several prices on page (${[...new Set(all)].join(", ")}); using the first`);
    return all[0];
  }
  return null;
}

export async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  return { status: res.status, html: await res.text() };
}

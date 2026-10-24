// Validates data/catalog.json and data/room.json with zod and prints parts by price.
//   npx tsx scripts/check-catalog.ts            validate + table
//   npx tsx scripts/check-catalog.ts --fetch    also re-read each vendor page and update priceUsd
// Prices come from the vendor page at fetch time. Pages that block scripts keep their old price.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Part, Room } from "../src/lib/contracts";

const root = join(__dirname, "..");
const catalogPath = join(root, "data/catalog.json");
const roomPath = join(root, "data/room.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

/** Pulls the product price out of a vendor page. Each vendor marks it up differently. */
function extractPrice(html: string): number | null {
  const patterns = [
    /product:price:amount" content="([0-9.]+)"/, // Adafruit, SparkFun (Open Graph)
    /"price":"([0-9.]+)"/,                        // Pololu (JSON-LD)
    /"price":([0-9.]+)[,}]/,                      // DFRobot
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

async function refreshPrices(parts: Part[]) {
  for (const p of parts) {
    try {
      const res = await fetch(p.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
      const html = await res.text();
      const price = res.ok ? extractPrice(html) : null;
      if (price && price > 0) {
        if (price !== p.priceUsd) console.log(`price ${p.id}: ${p.priceUsd} -> ${price}`);
        p.priceUsd = price;
      } else {
        console.warn(`no price found for ${p.id} (HTTP ${res.status}); kept ${p.priceUsd}`);
      }
    } catch (e) {
      console.warn(`fetch failed for ${p.id}: ${(e as Error).message}`);
    }
  }
}

async function main() {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parts = z.array(Part).parse(raw);

  const ids = new Set<string>();
  for (const p of parts) {
    if (ids.has(p.id)) throw new Error(`duplicate part id ${p.id}`);
    ids.add(p.id);
    if (p.priceUsd <= 0) console.warn(`missing price: ${p.id}`);
    const r = p.caps.reachMm;
    if (r && r.min > r.max) throw new Error(`${p.id}: reach min > max`);
  }

  if (process.argv.includes("--fetch")) {
    await refreshPrices(parts);
    writeFileSync(catalogPath, JSON.stringify(parts, null, 2) + "\n");
  }

  const room = Room.parse(JSON.parse(readFileSync(roomPath, "utf8")));

  console.table(
    [...parts]
      .sort((a, b) => a.category.localeCompare(b.category) || a.priceUsd - b.priceUsd)
      .map((p) => ({ id: p.id, category: p.category, priceUsd: p.priceUsd, vendor: p.vendor, verified: p.verified })),
  );
  console.log(`catalog OK: ${parts.length} parts. room OK: ${room.name}, ${room.targets.length} targets.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

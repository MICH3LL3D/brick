// Validates data/catalog.json and data/room.json with zod and prints parts by price.
//   npx tsx scripts/check-catalog.ts            validate + table
//   npx tsx scripts/check-catalog.ts --fetch    also re-read each vendor page and update priceUsd
// Prices come from the vendor page at fetch time. Pages that block scripts keep their old price.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Part, Room } from "../src/lib/contracts";
import { extractPrice, fetchPage } from "./vendor";

const root = join(__dirname, "..");
const catalogPath = join(root, "data/catalog.json");
const roomPath = join(root, "data/room.json");

async function refreshPrices(parts: Part[]) {
  for (const p of parts) {
    try {
      const { status, html } = await fetchPage(p.url);
      const price = status === 200 ? extractPrice(html) : null;
      if (price && price > 0) {
        if (price !== p.priceUsd) console.log(`price ${p.id}: ${p.priceUsd} -> ${price}`);
        p.priceUsd = price;
      } else {
        console.warn(`no price found for ${p.id} (HTTP ${status}); kept ${p.priceUsd}`);
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
  checkRoomGeometry(room);

  console.table(
    [...parts]
      .sort((a, b) => a.category.localeCompare(b.category) || a.priceUsd - b.priceUsd)
      .map((p) => ({ id: p.id, category: p.category, priceUsd: p.priceUsd, vendor: p.vendor, verified: p.verified })),
  );
  console.log(`catalog OK: ${parts.length} parts. room OK: ${room.name}, ${room.targets.length} targets.`);
}

/** Cheap sanity checks on the hand-written room: bounds, free home, targets inside the room. */
function checkRoomGeometry(room: z.infer<typeof Room>) {
  const problems: string[] = [];
  const inRoom = (x: number, y: number) => x >= 0 && y >= 0 && x <= room.widthMm && y <= room.depthMm;
  for (const o of room.obstacles) {
    if (!inRoom(o.x, o.y) || !inRoom(o.x + o.w, o.y + o.d)) problems.push(`obstacle ${o.id} leaves the room`);
    if (room.home.x >= o.x && room.home.x <= o.x + o.w && room.home.y >= o.y && room.home.y <= o.y + o.d)
      problems.push(`home is inside ${o.id}`);
  }
  for (const t of room.targets) if (!inRoom(t.x, t.y)) problems.push(`target ${t.id} is outside the room`);
  for (const d of room.doorways) if (!inRoom(d.x, d.y)) problems.push(`doorway at ${d.x},${d.y} is outside the room`);
  if (problems.length) throw new Error(`room.json: ${problems.join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

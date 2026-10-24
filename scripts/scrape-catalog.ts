// Asks Gemini (CATALOG_SCRAPE model + Google Search grounding) to propose catalog parts from
// reliable vendors, then writes them to data/catalog.candidates.json for a human to merge.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/scrape-catalog.ts [category ...]
//
// Every candidate starts verified:false. Entries without a real, reachable vendor URL are dropped.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Part, PartCategory } from "../src/lib/contracts";
import { getGemini, geminiTimeout, parseJsonText } from "../src/lib/gemini";
import { MODELS } from "../src/lib/models";
import { extractPrice, fetchPage } from "./vendor";

const root = join(__dirname, "..");
const outPath = join(root, "data/catalog.candidates.json");
const catalogPath = join(root, "data/catalog.json");

const VENDORS = ["adafruit.com", "sparkfun.com", "pololu.com", "dfrobot.com"];
const FALLBACK_VENDORS = ["amazon.com"];

const WANTED: Record<string, string> = {
  chassis: "wheeled robot chassis kits with motors: 2WD small, 2WD medium, 4WD medium, 4WD large",
  controller: "Raspberry Pi 4 Model B 4GB and Raspberry Pi 5 4GB boards",
  motor_driver: "DC motor drivers usable from a Raspberry Pi (dual H-bridge breakouts, motor HATs)",
  arm: "robot arms: small servo arm kits, and 12V linear actuators with position feedback usable as a lift",
  tool: "robot grippers, small 5V/12V water pumps (peristaltic or submersible), camera pan-tilt mounts",
  sensor: "Raspberry Pi cameras, ultrasonic distance sensors, I2C IMUs",
  power: "robot battery packs (NiMH, USB power banks) and 5V step-down regulators for a Pi",
  misc: "PCA9685 servo driver boards, ADS1115 ADC boards",
};

const Candidate = Part.omit({ verified: true }).extend({ verified: z.literal(false).default(false) });

function prompt(category: string): string {
  return [
    `Use Google Search to find 2-5 real, currently sold products in this category: ${WANTED[category]}.`,
    `Only use product pages on these vendors: ${VENDORS.join(", ")}. Use amazon.com only if none of them sell it.`,
    "Return ONLY a JSON array (no prose). Each item must match:",
    `{ "id": "kebab-case-id", "category": "${category}", "name": string, "priceUsd": number (from the product page),`,
    `  "vendor": string, "url": "exact product page URL", "verified": false,`,
    `  "dims": {"l": mm, "w": mm, "h": mm}, "massG": number,`,
    `  "caps": { only the fields that apply: wheels, maxPayloadG, speedMps, wheelDiameterMm, reachMm {min,max}, liftMaxMm,`,
    `    armPayloadG, tankMl, pumpMlPerS, gripMaxMm, batteryWh, outputV, maxCurrentA, drawW, pins,`,
    `    interface ("gpio"|"pwm"|"i2c"|"usb"|"csi"|"none") },`,
    `  "mounts": ["deck"], "notes": "wiring gotchas from the datasheet: logic voltage, separate supplies, current" }`,
    "If you cannot find the exact product URL, leave the item out. Never invent URLs or prices.",
  ].join("\n");
}

function vendorAllowed(url: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return [...VENDORS, ...FALLBACK_VENDORS].some((v) => host === v || host.endsWith("." + v));
}

/** Fetches the product page. Returns the page price, or null if the page is not reachable. */
async function livePrice(url: string): Promise<{ live: boolean; price: number | null }> {
  try {
    const { status, html } = await fetchPage(url);
    return { live: status === 200, price: status === 200 ? extractPrice(html) : null };
  } catch {
    return { live: false, price: null };
  }
}

async function scrapeCategory(category: string) {
  const ai = getGemini();
  const res = await ai.models.generateContent({
    model: MODELS.CATALOG_SCRAPE,
    contents: prompt(category),
    config: { tools: [{ googleSearch: {} }], temperature: 0.2, abortSignal: geminiTimeout(90_000) },
  });
  const raw = parseJsonText(res.text);
  const list = Array.isArray(raw) ? raw : [];
  const kept: z.infer<typeof Candidate>[] = [];
  for (const item of list) {
    const parsed = Candidate.safeParse({ ...item, verified: false });
    if (!parsed.success) {
      console.warn(`[${category}] dropped invalid item: ${JSON.stringify(item).slice(0, 120)}`);
      continue;
    }
    if (!vendorAllowed(parsed.data.url)) {
      console.warn(`[${category}] dropped ${parsed.data.id}: vendor not on the allow list (${parsed.data.url})`);
      continue;
    }
    const { live, price } = await livePrice(parsed.data.url);
    if (!live) {
      console.warn(`[${category}] dropped ${parsed.data.id}: URL not reachable (${parsed.data.url})`);
      continue;
    }
    // Never keep a price Gemini made up: use the page price, or flag it for the human.
    if (price && price > 0) parsed.data.priceUsd = price;
    else parsed.data.notes = `PRICE NOT CONFIRMED FROM PAGE. ${parsed.data.notes}`;
    kept.push(parsed.data);
  }
  console.log(`[${category}] kept ${kept.length}/${list.length}`);
  return kept;
}

async function main() {
  const args = process.argv.slice(2);
  const categories = args.length ? args.map((a) => PartCategory.parse(a)) : PartCategory.options;

  const existingIds = new Set<string>(
    existsSync(catalogPath) ? (JSON.parse(readFileSync(catalogPath, "utf8")) as { id: string }[]).map((p) => p.id) : [],
  );

  const all = [];
  for (const c of categories) {
    try {
      all.push(...(await scrapeCategory(c)));
    } catch (e) {
      console.error(`[${c}] failed: ${(e as Error).message}`);
    }
  }
  // Merge with earlier runs so per-category runs do not discard each other.
  const previous: { id: string }[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
  const merged = new Map(previous.map((p) => [p.id, p]));
  for (const p of all) if (!existingIds.has(p.id)) merged.set(p.id, p);
  const fresh = [...merged.values()];
  writeFileSync(outPath, JSON.stringify(fresh, null, 2) + "\n");
  console.log(`wrote ${fresh.length} candidates to ${outPath}. Review by hand before merging into catalog.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

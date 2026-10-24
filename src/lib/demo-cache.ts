// Demo mode: cached designs for the 3 demo prompts so the demo survives bad wifi.
// Only task + design are cached; derived values and the sim are recomputed on every read,
// so catalog or sim changes never leave a stale cache.
import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Design, Task, type Part } from "./contracts";
import type { Room } from "./data";
import { deriveAndCheck } from "./derive";
import type { GenerateResult } from "./generate";
import { simulate } from "./sim-stub"; // switch to "./sim" when A's sim.ts lands

const CACHE_DIR = join(process.cwd(), "data/cache");

const CacheEntry = z.object({
  prompt: z.string(),
  recordedAt: z.string(),
  origin: z.enum(["gemini", "hand-built"]), // hand-built = placeholder until recorded from a real run
  task: Task,
  design: Design,
  attempts: z.number().default(1),
  repairNotes: z.array(z.string()).default([]),
});
export type CacheEntry = z.infer<typeof CacheEntry>;

/** "Water my plants!" -> "water-my-plants". Also used to match prompts loosely. */
export function slug(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function readCache(prompt: string, room: Room, catalog: Part[]): GenerateResult | null {
  const file = join(CACHE_DIR, `${slug(prompt)}.json`);
  if (!existsSync(file)) return null;
  const parsed = CacheEntry.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) return null;
  const { task, design, attempts, repairNotes } = parsed.data;
  const derived = deriveAndCheck(design, task, room, catalog);
  const sim = simulate(design, task, room, catalog);
  return { task, design, derived, sim, attempts, repairNotes, source: "cache" };
}

export function writeCache(entry: CacheEntry): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${slug(entry.prompt)}.json`);
  writeFileSync(file, JSON.stringify(CacheEntry.parse(entry), null, 2) + "\n");
  return file;
}

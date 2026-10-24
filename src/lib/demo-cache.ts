// Demo mode: cached designs for the 3 demo prompts so the demo survives bad wifi.
// Only task + design are cached; derived values and the sim are recomputed on every read,
// so catalog or sim changes never leave a stale cache.
import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Design, Task, type Part } from "./contracts";
import type { Room } from "./data";
import { checkWithReasons, type GenerateResult } from "./generate";
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

/** Cached result for a demo prompt, re-checked at `budgetUsd` (the request's budget) if given. */
export function readCache(prompt: string, room: Room, catalog: Part[], budgetUsd?: number, dir = CACHE_DIR): GenerateResult | null {
  const entry = readEntry(prompt, dir);
  if (!entry) return null;
  const { task, attempts, repairNotes, origin } = entry;
  const design = budgetUsd === undefined ? entry.design : { ...entry.design, budgetUsd };
  const derived = checkWithReasons(design, task, room, catalog);
  const sim = simulate(design, task, room, catalog);
  const ok = derived.checks.every((c) => c.ok);
  return { task, design, derived, sim, ok, attempts, repairNotes, source: "cache", cacheOrigin: origin };
}

/** `dir` defaults to data/cache; tests pass a temp dir. */
export function readEntry(prompt: string, dir = CACHE_DIR): CacheEntry | null {
  const file = join(dir, `${slug(prompt)}.json`);
  if (!existsSync(file)) return null;
  try {
    const parsed = CacheEntry.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // malformed file: behave as a cache miss
  }
}

export function writeCache(entry: CacheEntry): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${slug(entry.prompt)}.json`);
  writeFileSync(file, JSON.stringify(CacheEntry.parse(entry), null, 2) + "\n");
  return file;
}

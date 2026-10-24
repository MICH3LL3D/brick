import type { ThinkingLevel } from "@google/genai";

// The ONLY place Gemini model ids appear. Verified against
// https://ai.google.dev/gemini-api/docs/models on 2026-10-24 (all listed as stable).
// gemini-4-argon returned 429 (quota) on our key on 2026-10-24.
// Do not use gemini-2.5-*, gemini-3-pro-preview, or -latest aliases.

export const MODELS = {
  GENERATE: "gemini-3.8-flash",       // fallback if quality is weak: "gemini-4-argon"
  CHAT: "gemini-3.8-flash",
  CATALOG_SCRAPE: "gemini-3.8-flash", // used with Google Search grounding
  CHEAP: "gemini-3.5-flash-lite",     // assembly manual text
  FALLBACK: "gemini-3.6-flash",       // used when the primary is slow or overloaded (seen 2026-10-24)
  FALLBACK_2: "gemini-3.1-flash-lite", // last resort: fast, lower quality
} as const;

export type ModelRole = keyof typeof MODELS;

/**
 * Thinking level per model for design generation (config.thinkingConfig.thinkingLevel).
 * Measured 2026-10-24 on the 3 demo prompts: flash-lite at its default needed repair rounds
 * (budget, reasons) on 2 of 3; at "medium" all 3 passed first try in ~6-7 s per call.
 * "high" took 100 s+. Models not listed keep their default.
 */
export const GENERATE_THINKING: Partial<Record<string, ThinkingLevel>> = {
  [MODELS.FALLBACK_2]: "MEDIUM" as ThinkingLevel, // type-only import keeps the SDK out of client bundles
};

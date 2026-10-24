// The ONLY place Gemini model ids appear. Verified against
// https://ai.google.dev/gemini-api/docs/models on 2026-10-24 (all listed as stable).
// Do not use gemini-2.5-*, gemini-3-pro-preview, or -latest aliases.

export const MODELS = {
  GENERATE: "gemini-3.8-flash",       // fallback if quality is weak: "gemini-4-argon"
  CHAT: "gemini-3.8-flash",
  CATALOG_SCRAPE: "gemini-3.8-flash", // used with Google Search grounding
  CHEAP: "gemini-3.5-flash-lite",     // assembly manual text
} as const;

export type ModelRole = keyof typeof MODELS;

// Server-only Gemini client. Never import this from client components:
// the API key must stay on the server. `server-only` makes a client import fail at build.
// Node scripts that import this must run with `--conditions=react-server`.
import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { MODELS } from "./models";

let client: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local or run with DEMO_MODE=1.");
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * Abort signal for one Gemini call. Pass as `config.abortSignal` so a timed-out
 * request is cancelled instead of running (and billing) in the background.
 */
export function geminiTimeout(ms = 30_000): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Parses a JSON response body from Gemini, stripping ``` fences if the model added them. */
export function parseJsonText(text: string | undefined): unknown {
  if (!text) throw new Error("Gemini returned an empty response");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

/* ---------- Model fallback ---------- */

const PRIMARY_COOLDOWN_MS = 5 * 60_000;
const degradedUntil = new Map<string, number>();

/**
 * Calls `params.model`, and on timeout, overload (503) or quota (429) retries once on
 * MODELS.FALLBACK (with one retry after a short backoff). A primary that failed is skipped for 5 minutes so later calls do not wait again.
 */
export async function generateWithFallback(
  params: GenerateContentParameters,
  { primaryTimeoutMs = 25_000, fallbackTimeoutMs = 45_000 } = {},
): Promise<GenerateContentResponse & { modelUsed: string }> {
  const ai = getGemini();
  const primary = params.model;
  const fallback = MODELS.FALLBACK;
  const run = async (model: string, ms: number) => {
    const res = await ai.models.generateContent({ ...params, model, config: { ...params.config, abortSignal: geminiTimeout(ms) } });
    return Object.assign(res, { modelUsed: model });
  };

  if (primary !== fallback && (degradedUntil.get(primary) ?? 0) < Date.now()) {
    try {
      return await run(primary, primaryTimeoutMs);
    } catch (e) {
      if (!isTransient(e)) throw e;
      console.warn(`[gemini] ${primary} unavailable (${(e as Error).message.slice(0, 80)}); using ${fallback}`);
      degradedUntil.set(primary, Date.now() + PRIMARY_COOLDOWN_MS);
    }
  }
  try {
    return await run(fallback, fallbackTimeoutMs);
  } catch (e) {
    if (!isTransient(e)) throw e;
    await new Promise((r) => setTimeout(r, 2_000)); // one short backoff for overload spikes
    return run(fallback, fallbackTimeoutMs);
  }
}

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /abort|timed? ?out|503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|ECONNRESET|fetch failed/i.test(msg);
}

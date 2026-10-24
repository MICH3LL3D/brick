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
 * Calls `params.model`, then on timeout, overload (5xx) or quota (429) walks down
 * MODELS.FALLBACK and MODELS.FALLBACK_2, once each. A model that failed is skipped for
 * 5 minutes so later calls do not wait on it again. The last model is always tried.
 */
export async function generateWithFallback(
  params: GenerateContentParameters,
  { primaryTimeoutMs = 25_000, fallbackTimeoutMs = 45_000 } = {},
): Promise<GenerateContentResponse & { modelUsed: string }> {
  const ai = getGemini();
  const chain = [...new Set([params.model, MODELS.FALLBACK, MODELS.FALLBACK_2])];
  const run = async (model: string, ms: number) => {
    const res = await ai.models.generateContent({ ...params, model, config: { ...params.config, abortSignal: geminiTimeout(ms) } });
    return Object.assign(res, { modelUsed: model });
  };

  let lastError: unknown;
  for (const [i, model] of chain.entries()) {
    const last = i === chain.length - 1;
    if (!last && (degradedUntil.get(model) ?? 0) > Date.now()) continue;
    try {
      return await run(model, i === 0 ? primaryTimeoutMs : fallbackTimeoutMs);
    } catch (e) {
      if (!isTransient(e)) throw e;
      lastError = e;
      console.warn(`[gemini] ${model} unavailable (${(e as Error).message.slice(0, 80)})${last ? "" : `; trying ${chain[i + 1]}`}`);
      degradedUntil.set(model, Date.now() + PRIMARY_COOLDOWN_MS);
    }
  }
  throw lastError;
}

function isTransient(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /AbortError|aborted|timed? ?out|"code":\s*(429|5\d\d)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|high demand|ECONNRESET|socket hang up|other side closed|fetch failed/i.test(msg);
}

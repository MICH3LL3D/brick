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
/** Hedged mode: a model that was still thinking when another model won is skipped this long. */
const SLOW_COOLDOWN_MS = 60_000;
const degradedUntil = new Map<string, number>();

type FallbackOptions = {
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  /**
   * Hedged mode: if the current model has not answered after this many ms, start the next
   * model in parallel and take whichever answers first (the loser is aborted). A transient
   * failure starts the next model at once. Omit for the plain sequential walk.
   */
  hedgeMs?: number;
  /** Hedged mode only: a response that fails this test does not win; the race goes on. */
  accept?: (res: GenerateContentResponse) => boolean;
  /** Extra config for one model in the chain (e.g. its thinking level). */
  configFor?: (model: string) => GenerateContentParameters["config"];
};

/**
 * Calls `params.model`, then on timeout, overload (5xx) or quota (429) walks down
 * MODELS.FALLBACK and MODELS.FALLBACK_2, once each. A model that failed is skipped for
 * 5 minutes so later calls do not wait on it again. The last model is always tried.
 * With `hedgeMs`, slow models are raced against the next one instead of waited on.
 */
export async function generateWithFallback(
  params: GenerateContentParameters,
  { primaryTimeoutMs = 25_000, fallbackTimeoutMs = 45_000, hedgeMs, accept, configFor }: FallbackOptions = {},
): Promise<GenerateContentResponse & { modelUsed: string }> {
  const ai = getGemini();
  const full = [...new Set([params.model, MODELS.FALLBACK, MODELS.FALLBACK_2])];
  const chain = full.filter((m, i) => i === full.length - 1 || (degradedUntil.get(m) ?? 0) <= Date.now());
  const run = async (model: string, signal: AbortSignal) => {
    const res = await ai.models.generateContent({ ...params, model, config: { ...params.config, ...configFor?.(model), abortSignal: signal } });
    return Object.assign(res, { modelUsed: model });
  };
  const timeoutFor = (model: string) => (model === params.model ? primaryTimeoutMs : fallbackTimeoutMs);
  const fail = (model: string, e: unknown, next: string | undefined) => {
    console.warn(`[gemini] ${model} unavailable (${(e as Error).message.slice(0, 80)})${next ? `; trying ${next}` : ""}`);
    degradedUntil.set(model, Date.now() + PRIMARY_COOLDOWN_MS);
  };

  if (hedgeMs === undefined) {
    let lastError: unknown;
    for (const [i, model] of chain.entries()) {
      try {
        return await run(model, geminiTimeout(timeoutFor(model)));
      } catch (e) {
        if (!isTransient(e)) throw e;
        lastError = e;
        fail(model, e, chain[i + 1]);
      }
    }
    throw lastError;
  }

  return new Promise((resolve, reject) => {
    const controllers: { abort: (slow: boolean) => void }[] = [];
    let next = 0;
    let pending = 0;
    let done = false;
    let lastError: unknown = new Error("No Gemini model answered");
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let unusable: (GenerateContentResponse & { modelUsed: string }) | undefined;

    const finish = (err: unknown, res?: GenerateContentResponse & { modelUsed: string }) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      for (const c of controllers) c.abort(Boolean(res));
      if (res) resolve(res);
      else reject(err);
    };
    const launch = () => {
      clearTimeout(hedgeTimer);
      if (done || next >= chain.length) return;
      const model = chain[next++];
      // One controller per call, aborted by its own timer or by the winner. (AbortSignal.any
      // over a timeout signal did not reliably fire here, so the timer is explicit.)
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error(`${model} timed out`)), timeoutFor(model));
      let lost = false;
      let settled = false;
      controllers.push({
        abort: (slow) => {
          if (settled) return;
          lost = true;
          if (slow) degradedUntil.set(model, Math.max(degradedUntil.get(model) ?? 0, Date.now() + SLOW_COOLDOWN_MS));
          ctrl.abort();
        },
      });
      pending++;
      if (next < chain.length) hedgeTimer = setTimeout(launch, hedgeMs);
      run(model, ctrl.signal)
        .finally(() => {
          clearTimeout(timer);
          settled = true;
        })
        .then(
          (res) => {
            pending--;
            if (done) return;
            if (!accept || accept(res)) return finish(null, res);
            console.warn(`[gemini] ${model} returned an unusable response`);
            unusable ??= res;
            if (next < chain.length) launch();
            else if (pending === 0) finish(null, unusable); // nothing better is coming; let the caller repair it
          },
          (e) => {
            pending--;
            if (done || lost) return;
            if (!isTransient(e)) return finish(e);
            lastError = e;
            fail(model, e, chain[next]);
            if (next < chain.length) launch();
            else if (pending === 0) finish(lastError, unusable);
          },
        );
    };
    launch();
  });
}

function isTransient(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /AbortError|aborted|timed? ?out|"code":\s*(429|5\d\d)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|high demand|ECONNRESET|socket hang up|other side closed|fetch failed/i.test(msg);
}

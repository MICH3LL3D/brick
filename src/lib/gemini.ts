// Server-only Gemini client. Never import this from client components:
// the API key must stay on the server. `server-only` makes a client import fail at build.
// Node scripts that import this must run with `--conditions=react-server`.
import "server-only";
import { GoogleGenAI } from "@google/genai";

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

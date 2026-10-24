// Server-only Gemini client. Never import this from client components:
// the API key must stay on the server.
import { GoogleGenAI } from "@google/genai";

if (typeof window !== "undefined") {
  throw new Error("gemini.ts is server-only");
}

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

/** Rejects if `p` does not settle within `ms`. Keeps the demo from hanging on bad wifi. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = "Gemini call"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Parses a JSON response body from Gemini, stripping ``` fences if the model added them. */
export function parseJsonText(text: string | undefined): unknown {
  if (!text) throw new Error("Gemini returned an empty response");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

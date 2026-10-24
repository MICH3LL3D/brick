// POST /api/generate { prompt, budgetUsd, roomId?, stream? } -> { task, design, derived, sim, attempts, repairNotes, source }
// With stream:true the reply is NDJSON: {"progress":"..."} lines while the agents work, then one
// {"result":{...}} or {"error":"...","status":n} line. Set AGENTS=single to skip the agent team.
import { z } from "zod";
import { loadCatalog, loadRoom } from "@/lib/data";
import { readCache } from "@/lib/demo-cache";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";
import { generateTeamDesign } from "@/lib/agents/team";
import { generateDesign } from "@/lib/generate";

export const maxDuration = 120;

const Body = z.object({
  prompt: z.string().trim().min(1).max(500),
  budgetUsd: z.number().min(50).max(500),
  roomId: z.string().optional(), // one room for now
  stream: z.boolean().optional(),
});

let running = 0; // shortcut: per-process cap instead of a per-IP limit; add real rate limiting before this is public.

type Reply = { result: unknown } | { error: string; status: number };

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Send { prompt, budgetUsd } with a budget between $50 and $500." }, { status: 400 });
  }
  if (running >= 4) return Response.json({ error: "Too many designs in progress. Try again in a moment." }, { status: 429 });
  const { prompt, budgetUsd, stream } = body.data;
  const room = loadRoom();
  const catalog = loadCatalog();

  async function design(say: (text: string) => void): Promise<Reply> {
    if (isDemoMode() || !hasGeminiKey()) {
      const cached = readCache(prompt, room, catalog, budgetUsd);
      if (cached) return { result: cached };
      return { error: "Offline demo mode: only the 3 demo prompts are available without a connection.", status: 503 };
    }
    try {
      if (process.env.AGENTS !== "single") {
        try {
          return { result: await generateTeamDesign(prompt, budgetUsd, room, catalog, say) };
        } catch (e) {
          console.error("[generate] agent team failed, using the single call", e);
          say("The agent team hit a problem. Falling back to a single designer…");
        }
      }
      return { result: await generateDesign(prompt, budgetUsd, room, catalog) };
    } catch (e) {
      console.error("[generate]", e);
      // Network or Gemini trouble: fall back to the cache if this is a demo prompt.
      const cached = readCache(prompt, room, catalog, budgetUsd);
      if (cached) return { result: cached };
      return { error: "Could not design a robot right now. Please try again.", status: 502 };
    }
  }

  if (!stream) {
    running++;
    const r = await design(() => {}).finally(() => running--);
    return "result" in r ? Response.json(r.result) : Response.json({ error: r.error }, { status: r.status });
  }

  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        running++;
        try {
          send(await design((progress) => send({ progress })));
        } finally {
          running--;
          ctrl.close();
        }
      },
    }),
    { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } },
  );
}

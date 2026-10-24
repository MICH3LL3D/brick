// POST /api/generate { prompt, budgetUsd, roomId? } -> { task, design, derived, sim, attempts, repairNotes, source }
import { z } from "zod";
import { loadCatalog, loadRoom } from "@/lib/data";
import { readCache } from "@/lib/demo-cache";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";
import { generateDesign } from "@/lib/generate";

const Body = z.object({
  prompt: z.string().trim().min(1).max(500),
  budgetUsd: z.number().min(50).max(500),
  roomId: z.string().optional(), // one room for now
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Send { prompt, budgetUsd } with a budget between $50 and $500." }, { status: 400 });
  }
  const { prompt, budgetUsd } = body.data;
  const room = loadRoom();
  const catalog = loadCatalog();

  if (isDemoMode() || !hasGeminiKey()) {
    const cached = readCache(prompt, room, catalog);
    if (cached) return Response.json(cached);
    return Response.json(
      { error: "Offline demo mode: only the 3 demo prompts are available without a connection." },
      { status: 503 },
    );
  }

  try {
    return Response.json(await generateDesign(prompt, budgetUsd, room, catalog));
  } catch (e) {
    console.error("[generate]", e);
    // Network or Gemini trouble: fall back to the cache if this is a demo prompt.
    const cached = readCache(prompt, room, catalog);
    if (cached) return Response.json(cached);
    return Response.json({ error: "Could not design a robot right now. Please try again." }, { status: 502 });
  }
}

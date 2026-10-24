// POST /api/manual { design, task, stream? } -> ManualSet (source "gemini")
// With stream:true the reply is NDJSON like /api/generate: {"progress"} lines, then {"result"} or {"error","status"}.
// Without a Gemini key (or in DEMO_MODE) it answers 503 and the viewer keeps the sample manuals.
import { z } from "zod";
import { generateManuals } from "@/lib/manuals/build";
import { Design, RoutineStep } from "@/lib/contracts";
import { loadCatalog, loadRoom } from "@/lib/data";
import { deriveAndCheck } from "@/lib/derive";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";

export const maxDuration = 180;

// The design comes from the client, so it is capped (it feeds every writer prompt) and its free text is rebuilt or dropped.
const BoundedDesign = Design.extend({
  summary: z.string().max(300),
  partIds: z.array(z.string().max(64)).max(40),
  reasons: z.record(z.string().max(64), z.string().max(300)),
  routine: z.array(RoutineStep).max(40),
});

const Body = z.object({
  design: BoundedDesign,
  task: z.object({ prompt: z.string().max(500), targetIds: z.array(z.string()).max(20) }),
  stream: z.boolean().optional(),
});

let running = 0; // shortcut: per-process cap instead of a per-IP limit; add real rate limiting before this is public.

type Reply = { result: unknown } | { error: string; status: number };

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { design, task }." }, { status: 400 });
  if (isDemoMode() || !hasGeminiKey()) return Response.json({ error: "Manuals need a Gemini connection." }, { status: 503 });
  if (running >= 2) return Response.json({ error: "Busy writing manuals. Try again in a moment." }, { status: 429 });
  const { task, stream } = body.data;
  const design = { ...body.data.design, reasons: {} }; // reasons are not used by the manual and must not reach prompts
  const catalog = loadCatalog();

  async function write(say: (t: string) => void): Promise<Reply> {
    running++;
    try {
      const derived = deriveAndCheck(design, task, loadRoom(), catalog);
      return { result: await generateManuals(design, derived, catalog, say) };
    } catch (e) {
      console.error("[manual]", e);
      return { error: "Could not write the manuals right now.", status: 502 };
    } finally {
      running--;
    }
  }

  if (!stream) {
    const r = await write(() => {});
    return "result" in r ? Response.json(r.result) : Response.json({ error: r.error }, { status: r.status });
  }
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        send(await write((progress) => send({ progress })));
        ctrl.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } },
  );
}

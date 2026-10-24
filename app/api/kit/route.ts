// POST /api/kit { design, task } -> application/zip
import { z } from "zod";
import { Design, Task } from "@/lib/contracts";
import { loadCatalog, loadRoom } from "@/lib/data";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";
import { buildKit, KitCheckError, KitCompileError } from "@/lib/kit";

export const maxDuration = 60;

const Body = z.object({ design: Design, task: Task });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { design, task }." }, { status: 400 });

  try {
    const zip = await buildKit(body.data.design, body.data.task, loadRoom(), loadCatalog(), hasGeminiKey() && !isDemoMode());
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="robot-kit.zip"',
      },
    });
  } catch (e) {
    if (e instanceof KitCheckError) {
      return Response.json({ error: "Fix these checks before downloading the kit.", details: e.errors }, { status: 422 });
    }
    console.error("[kit]", e);
    const message = e instanceof KitCompileError ? "The generated code did not pass its compile check, so no kit was made." : "Could not build the kit.";
    return Response.json({ error: message, details: e instanceof KitCompileError ? e.errors : undefined }, { status: 500 });
  }
}

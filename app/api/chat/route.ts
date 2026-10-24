// POST /api/chat { messages, design, task, limitations? } -> { reply, actions: ChatAction[], source }
import { z } from "zod";
import { ChatMessage, chat, offlineChat } from "@/lib/chat";
import { Design, Task } from "@/lib/contracts";
import { loadCatalog, loadRoom } from "@/lib/data";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";

const Body = z.object({
  messages: z.array(ChatMessage).min(1).max(50),
  design: Design,
  task: Task,
  // From /api/generate; capped so a client cannot stuff the prompt.
  limitations: z.array(z.string()).optional().transform((a) => a?.slice(0, 10).map((s) => s.slice(0, 300))),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Send { messages, design, task }." }, { status: 400 });
  }
  const { messages, design, task, limitations } = body.data;
  const room = loadRoom();
  const catalog = loadCatalog();

  if (isDemoMode() || !hasGeminiKey()) {
    return Response.json(offlineChat(messages, design, task, room, catalog, limitations));
  }
  try {
    return Response.json(await chat(messages, design, task, room, catalog, limitations));
  } catch (e) {
    console.error("[chat]", e);
    return Response.json(offlineChat(messages, design, task, room, catalog, limitations));
  }
}

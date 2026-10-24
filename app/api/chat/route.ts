// POST /api/chat { messages, design, task } -> { reply, actions: ChatAction[], source }
import { z } from "zod";
import { ChatMessage, chat, offlineChat } from "@/lib/chat";
import { Design, Task } from "@/lib/contracts";
import { loadCatalog, loadRoom } from "@/lib/data";
import { hasGeminiKey, isDemoMode } from "@/lib/gemini";

const Body = z.object({
  messages: z.array(ChatMessage).min(1).max(50),
  design: Design,
  task: Task,
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Send { messages, design, task }." }, { status: 400 });
  }
  const { messages, design, task } = body.data;
  const room = loadRoom();
  const catalog = loadCatalog();

  if (isDemoMode() || !hasGeminiKey()) {
    return Response.json(offlineChat(messages, design, task, room, catalog));
  }
  try {
    return Response.json(await chat(messages, design, task, room, catalog));
  } catch (e) {
    console.error("[chat]", e);
    return Response.json(offlineChat(messages, design, task, room, catalog));
  }
}

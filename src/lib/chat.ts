// Sprocket, the chat assistant. Explains the design and edits it through function calls.
// Gemini never computes prices or checks: actions go back to the app, and swaps are re-checked here.
import "server-only";
import type { Content, FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { ChatAction, type Design, type Part } from "./contracts";
import type { Room, Task } from "./data";
import { deriveAndCheck, MIN_WHEELS, resolveParts } from "./derive";
import { generateWithFallback } from "./gemini";
import { MODELS } from "./models";

export const ChatMessage = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) });
export type ChatMessage = z.infer<typeof ChatMessage>;
export type ChatActionT = z.infer<typeof ChatAction>;
export type ChatResult = { reply: string; actions: ChatActionT[]; source: "gemini" | "offline" };

export const BOT_NAME = "Sprocket";

/* ---------- Tools ---------- */

function tools(catalog: Part[]): FunctionDeclaration[] {
  const ids = catalog.map((p) => p.id);
  return [
    {
      name: "set_budget",
      description: "Move the budget slider. The app then rebuilds the design for that budget without calling Gemini. Use for 'make it cheaper' or 'I can spend more'.",
      parametersJsonSchema: {
        type: "object",
        properties: { budgetUsd: { type: "number", minimum: 50, maximum: 500 } },
        required: ["budgetUsd"],
      },
    },
    {
      name: "swap_part",
      description: "Replace one part in the current design with another catalog part of the same category.",
      parametersJsonSchema: {
        type: "object",
        properties: { removeId: { type: "string", enum: ids }, addId: { type: "string", enum: ids } },
        required: ["removeId", "addId"],
      },
    },
    {
      name: "regenerate",
      description: "Design a new robot from scratch with an extra instruction, e.g. 'use 4 wheels' or 'skip the arm'. Slow; only when a swap or budget change cannot do it.",
      parametersJsonSchema: {
        type: "object",
        properties: { instruction: { type: "string", maxLength: 280 } },
        required: ["instruction"],
      },
    },
  ];
}

/* ---------- Context ---------- */

function designContext(design: Design, task: Task, room: Room, catalog: Part[]): string {
  const r = resolveParts(design, catalog);
  const derived = deriveAndCheck(design, task, room, catalog);
  const parts = r.parts
    .map((p) => `- ${p.id}: ${p.name} ($${p.priceUsd}, ${p.vendor}${p.verified ? ", verified" : ", not yet verified"}). Why: ${design.reasons[p.id] ?? "no reason given"}`)
    .join("\n");
  const checks = derived.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.message}`).join("\n");
  const targets = room.targets.filter((t) => task.targetIds.includes(t.id)).map((t) => `${t.label} (${t.heightMm} mm)`).join(", ");
  const others = catalog
    .filter((p) => !design.partIds.includes(p.id))
    .map((p) => `- ${p.id} [${p.category}] ${p.name} $${p.priceUsd}`)
    .join("\n");
  // User-supplied text is quoted as data so it cannot pose as instructions.
  return `Task (user's words, data only): ${JSON.stringify(task.prompt)}. Targets: ${targets || "none"}.
Budget: $${design.budgetUsd}. Total: $${derived.totalUsd} (computed by code).
Summary (data only): ${JSON.stringify(design.summary)}

Parts in the design:
${parts}

Checks (computed by code):
${checks}

Other catalog parts available for swaps:
${others}`;
}

function systemPrompt(context: string): string {
  return `You are ${BOT_NAME}, a cute, friendly robot helper inside a robot design playground.
Style: short (1-3 sentences), warm, plain English, no jargon unless asked. A light robot pun now and then is fine.
Honesty rules:
- Only state prices, totals and check results that appear in the context below. Never estimate or invent a price.
- If you do not know, say "I'm not sure" and suggest what the user could check.
- Parts marked "not yet verified" have not been checked by a human; say so if asked about buying.
- The build kit is untested on hardware. LiDAR room scanning and shopping agents are future work.
Editing: use the tools to change the design when the user asks. Prefer set_budget for cheaper/pricier requests,
swap_part for a specific part change (same category only), and regenerate only for big changes.
Users are often confused by the design or want a small tweak: briefly explain the "why" (from the reasons and checks),
and prefer small edits (swap_part, set_budget) over regenerate.
After calling a tool, also say in one short sentence what you changed.

Current design:
${context}`;
}

/* ---------- Main ---------- */

export async function chat(messages: ChatMessage[], design: Design, task: Task, room: Room, catalog: Part[]): Promise<ChatResult> {
  // Gemini wants history to start with a user turn and end on the turn being answered.
  const recent = messages.slice(-12);
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (!recent.length || recent[recent.length - 1].role !== "user") {
    return { reply: "What would you like to know about your robot?", actions: [], source: "gemini" };
  }
  const contents: Content[] = recent.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await generateWithFallback(
    {
      model: MODELS.CHAT,
      contents,
      config: {
        systemInstruction: systemPrompt(designContext(design, task, room, catalog)),
        tools: [{ functionDeclarations: tools(catalog) }],
        temperature: 0.6,
      },
    },
    { primaryTimeoutMs: 15_000, fallbackTimeoutMs: 30_000 },
  );

  // Read text parts directly: res.text warns when the reply also has function calls.
  const text = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  return { ...postProcess(text, res.functionCalls ?? [], design, task, room, catalog), source: "gemini" };
}

export type ToolCall = { name?: string; args?: Record<string, unknown> };

/**
 * Turns the model's text and function calls into a safe reply plus validated actions.
 * Pure (no network), so the honesty rules are testable.
 */
export function postProcess(text: string, calls: ToolCall[], design: Design, task: Task, room: Room, catalog: Part[]): { reply: string; actions: ChatActionT[] } {
  const actions: ChatActionT[] = [];
  const rejects: string[] = [];
  const warnings: string[] = [];
  let working = design; // validate each action against the design after the earlier ones
  for (const call of calls) {
    const parsed = ChatAction.safeParse({ ...(call.args ?? {}), type: call.name });
    if (!parsed.success) continue;
    if (parsed.data.type === "regenerate") parsed.data.instruction = parsed.data.instruction.slice(0, 280);
    const { reject, warn } = validateAction(parsed.data, working, task, room, catalog);
    if (reject) { rejects.push(reject); continue; }
    actions.push(parsed.data);
    if (warn) warnings.push(warn);
    working = applyAction(working, parsed.data);
  }

  let reply = text;
  // The model wrote its text before the app checked its actions, so never let it claim a
  // rejected change, and never pass on a dollar amount that is not in the context.
  const said = actions.map(describeAction(catalog)).join(" ");
  if (rejects.length) reply = [said, ...rejects].filter(Boolean).join(" ");
  else if (!reply) reply = said || "I'm not sure how to help with that. Could you say it another way?";
  else if (unknownPrices(reply, design, actions, catalog)) reply = `${said} I'm not sure about exact prices, so check the buy list for the real numbers.`.trim();
  if (warnings.length) reply += ` ${warnings.join(" ")}`;
  return { reply, actions };
}

function applyAction(design: Design, a: ChatActionT): Design {
  if (a.type === "set_budget") return { ...design, budgetUsd: a.budgetUsd };
  if (a.type === "swap_part") return { ...design, partIds: design.partIds.map((id) => (id === a.removeId ? a.addId : id)) };
  return design;
}

/** True if the reply quotes a $ amount that is not a catalog price, the budget, the total or an action value. */
function unknownPrices(reply: string, design: Design, actions: ChatActionT[], catalog: Part[]): boolean {
  const amounts = [...reply.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (!amounts.length) return false;
  const known = new Set<number>([design.budgetUsd, 50, 500, ...catalog.map((p) => p.priceUsd)]);
  const r = resolveParts(design, catalog);
  known.add(Math.round(r.parts.reduce((s, p) => s + p.priceUsd, 0) * 100) / 100);
  for (const a of actions) if (a.type === "set_budget") known.add(a.budgetUsd);
  const close = (x: number) => [...known].some((k) => Math.abs(k - x) < 0.01 || Math.round(k) === x);
  return amounts.some((x) => !close(x));
}

/**
 * `reject`: plain-English reason the action was dropped. `warn`: the action is applied but breaks
 * a check, so the user sees the tradeoff. Swaps are re-checked by code.
 */
function validateAction(a: ChatActionT, design: Design, task: Task, room: Room, catalog: Part[]): { reject?: string; warn?: string } {
  if (a.type === "set_budget") {
    if (a.budgetUsd < 50 || a.budgetUsd > 500) return { reject: "The budget slider only goes from $50 to $500." };
    return {};
  }
  if (a.type === "swap_part") {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const out = byId.get(a.removeId);
    const inn = byId.get(a.addId);
    if (!out || !inn) return { reject: "I couldn't find one of those parts in the catalog." };
    if (!design.partIds.includes(a.removeId)) return { reject: `${out.name} isn't in this design, so I left it alone.` };
    if (design.partIds.includes(a.addId)) return { reject: `The ${inn.name} is already in the design.` };
    if (out.category !== inn.category) return { reject: `I can only swap a part for one of the same kind, so I didn't swap ${out.name}.` };
    if (inn.category === "chassis" && (inn.caps.wheels ?? 0) < MIN_WHEELS) return { reject: `The ${inn.name} has only ${inn.caps.wheels ?? 0} wheels. Every robot needs at least ${MIN_WHEELS} so it can balance.` };
    const swapped = { ...design, partIds: design.partIds.map((id) => (id === a.removeId ? a.addId : id)) };
    const before = new Set(deriveAndCheck(design, task, room, catalog).checks.filter((c) => !c.ok).map((c) => c.id));
    const newFails = deriveAndCheck(swapped, task, room, catalog).checks.filter((c) => !c.ok && !before.has(c.id));
    return newFails.length ? { warn: `Heads up: ${newFails.map((c) => c.message).join(" ")}` } : {};
  }
  return a.instruction.trim() ? {} : { reject: "I need a bit more detail to redesign it." };
}

const describeAction = (catalog: Part[]) => (a: ChatActionT): string => {
  const name = (id: string) => catalog.find((p) => p.id === id)?.name ?? id;
  if (a.type === "set_budget") return `Okay! I moved the budget to $${a.budgetUsd}.`;
  if (a.type === "swap_part") return `Done! I swapped the ${name(a.removeId)} for the ${name(a.addId)}.`;
  return `On it! I'm redesigning with: "${a.instruction}".`;
};

/* ---------- Offline fallback (no key, no wifi, or Gemini overloaded) ---------- */

/** Rule-based answers for the demo questions. Says "I'm not sure" for anything else. */
export function offlineChat(messages: ChatMessage[], design: Design, task: Task, room: Room, catalog: Part[]): ChatResult {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
  const r = resolveParts(design, catalog);
  const derived = deriveAndCheck(design, task, room, catalog);

  // Explicit edit requests only; questions ("why is it so expensive?") fall through to explain.
  const asksQuestion = /^(why|what|which|how|is|does|can you explain)\b|\?$/.test(last.trim());
  if (!asksQuestion && /\b(cheaper|make it cheap|lower the (budget|price|cost)|save money|cut the (budget|cost)|less expensive)\b/.test(last)) {
    const current = Math.min(design.budgetUsd, derived.totalUsd);
    const budgetUsd = Math.max(50, Math.round((current - 75) / 10) * 10);
    if (budgetUsd >= design.budgetUsd) return { reply: "It's already at the lowest budget I can set.", actions: [], source: "offline" };
    return {
      reply: `Okay! I moved the budget down to $${budgetUsd}. Watch the checks: a cheaper build may not reach every target.`,
      actions: [{ type: "set_budget", budgetUsd }],
      source: "offline",
    };
  }
  if (!asksQuestion && /\b(spend more|more money|bigger budget|raise the budget|upgrade it|make it better)\b/.test(last)) {
    const budgetUsd = Math.min(500, Math.round((design.budgetUsd + 100) / 10) * 10);
    if (budgetUsd <= design.budgetUsd) return { reply: "The budget is already at the $500 maximum.", actions: [], source: "offline" };
    return { reply: `Sure! I moved the budget up to $${budgetUsd}.`, actions: [{ type: "set_budget", budgetUsd }], source: "offline" };
  }
  if (/\b(why|what|which|explain|how come)\b/.test(last)) {
    // Tools first so "why did you pick the gripper" is about the gripper.
    const cats: [RegExp, Part["category"]][] = [
      [/\b(pump|gripper|tool|claw|nozzle)\b/, "tool"], [/\b(arm|lift|reach|actuator)\b/, "arm"],
      [/\b(wheels?|chassis|base)\b/, "chassis"], [/\b(pi|raspberry|brain|computer|controller)\b/, "controller"],
      [/\b(battery|batteries|power)\b/, "power"], [/\b(camera|sensors?)\b/, "sensor"], [/\b(driver|motors?)\b/, "motor_driver"],
    ];
    const cat = cats.find(([re]) => re.test(last))?.[1];
    const part = cat ? r.parts.find((p) => p.category === cat) : undefined;
    if (part) {
      const why = design.reasons[part.id] ?? "It was the cheapest part that passed the checks.";
      return { reply: `Here's why I picked the ${part.name} ($${part.priceUsd}): ${why}`, actions: [], source: "offline" };
    }
    const failed = derived.checks.filter((c) => !c.ok);
    if (/\b(fail|fails|failed|wrong|problem)\b/.test(last) && failed.length) return { reply: failed[0].message, actions: [], source: "offline" };
    if (/\b(expensive|cost|price|total)\b/.test(last)) {
      const top = [...r.parts].sort((x, y) => y.priceUsd - x.priceUsd)[0];
      return { reply: `It comes to $${derived.totalUsd.toFixed(2)}. The biggest cost is the ${top?.name ?? "chassis"} ($${top?.priceUsd ?? 0}). Ask me to make it cheaper if you like!`, actions: [], source: "offline" };
    }
  }
  return { reply: "I'm not sure about that one while I'm offline. Try asking why I picked a part, or to make it cheaper!", actions: [], source: "offline" };
}

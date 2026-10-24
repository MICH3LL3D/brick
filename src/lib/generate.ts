// Prompt -> robot design. Gemini picks parts (schema-locked to catalog ids) and writes reasons;
// code checks everything and feeds failures back for up to MAX_REPAIRS repair rounds.
import "server-only";
import type { Content } from "@google/genai";
import { z } from "zod";
import { Design, RoutineStep, type Part } from "./contracts";
import type { Derived, Room, SimResult, Task } from "./data";
import { deriveAndCheck, failureText } from "./derive";
import { generateWithFallback, parseJsonText } from "./gemini";
import { MODELS } from "./models";
import { simulate } from "./sim-stub"; // switch to "./sim" when A's sim.ts lands

export const MAX_REPAIRS = 2;

export type GenerateResult = {
  task: Task;
  design: Design;
  derived: Derived;
  sim: SimResult;
  attempts: number;          // 1 = first try passed or no repair helped; up to 1 + MAX_REPAIRS
  repairNotes: string[];     // failure text sent back to Gemini on each repair, shown to the user
  source: "gemini" | "cache";
};

/* ---------- Response schema (ids locked by enum) ---------- */

function responseSchema(catalog: Part[], room: Room) {
  const partEnum = catalog.map((p) => p.id);
  const targetEnum = room.targets.map((t) => t.id);
  return {
    type: "object",
    properties: {
      targetIds: { type: "array", items: { type: "string", enum: targetEnum }, description: "Room targets the task acts on, in visit order. Empty if none fit." },
      summary: { type: "string", description: "One friendly sentence describing the robot and what it will do." },
      partIds: { type: "array", items: { type: "string", enum: partEnum }, description: "Every part in the robot." },
      reasons: {
        type: "array",
        items: {
          type: "object",
          properties: { partId: { type: "string", enum: partEnum }, reason: { type: "string" } },
          required: ["partId", "reason"],
        },
        description: "One short sentence per chosen part explaining why.",
      },
      routine: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: RoutineStep.shape.op.options },
            target: { type: "string", enum: targetEnum },
            value: { type: "number" },
          },
          required: ["op"],
        },
      },
    },
    required: ["targetIds", "summary", "partIds", "reasons", "routine"],
  };
}

const GeminiDesign = z.object({
  targetIds: z.array(z.string()),
  summary: z.string(),
  partIds: z.array(z.string()).min(1),
  reasons: z.array(z.object({ partId: z.string(), reason: z.string() })),
  routine: z.array(RoutineStep),
});

/* ---------- Prompts ---------- */

function catalogLines(catalog: Part[]): string {
  return catalog
    .map((p) => {
      const caps = Object.entries(p.caps)
        .map(([k, v]) => `${k}=${typeof v === "object" ? `${v.min}-${v.max}` : v}`)
        .join(" ");
      return `- ${p.id} [${p.category}] ${p.name} | $${p.priceUsd} | ${p.dims.l}x${p.dims.w}x${p.dims.h}mm ${p.massG}g | ${caps}`;
    })
    .join("\n");
}

function roomLines(room: Room): string {
  return room.targets.map((t) => `- ${t.id}: ${t.label}, action=${t.action}, height=${t.heightMm}mm`).join("\n");
}

export function systemPrompt(catalog: Part[], room: Room): string {
  return `You design ONE wheeled Raspberry Pi robot for a household task, using only parts from the catalog below.

Rules:
- Use only the part ids listed. Never invent parts.
- Prefer the cheapest design that passes every check and fits the budget. If the budget is too small, still return the closest feasible design.
- Give every chosen part a one-sentence plain-English reason.
- Pick targetIds from the room targets that the task is about, in a sensible visit order. If none fit, return an empty list.
- The routine may only use these ops: ${RoutineStep.shape.op.options.join(", ")}. Use goto <target> before acting on it; end with return_home.
- Wheeled robots only. If the task cannot be done by a wheeled robot, say so honestly in summary and return the closest feasible design.
- Do not compute prices or totals; code does that.

Code will check the design. Design to pass these checks:
- Exactly one controller (Raspberry Pi), one chassis, at most one arm, 1-2 batteries, at least one motor driver.
- Motor channels: wheels need 2; each linear actuator arm and each DC pump (interface=gpio) needs 1 more. I2C motor HATs give 4 channels, other drivers 2.
- Parts with interface=pwm (servos) need the PCA9685 servo board.
- The Pi needs 5V at 3A: a 5V step-down regulator (maxCurrentA>=3) fed by a battery above 5.5V. USB power banks give only 2A, which fails.
- Battery: at least 15 minutes runtime at 80% of batteryWh vs the sum of drawW.
- Payload: everything except the chassis, plus a full water tank, must be under the chassis maxPayloadG.
- Reach: tool top = chassis height + arm liftMaxMm + 50mm must be at least each acted target's height. Targets on furniture are up to ~150mm in from the edge: arm reachMm max + 50 must cover that.
- Water needs a pump and a tank (100ml per plant). Pickup needs a gripper and an arm lifting at least 700 g. Photograph needs a camera.
- The robot must fit through a ${Math.max(...room.doorways.map((d) => d.widthMm))}mm doorway with 50mm each side.

Room targets:
${roomLines(room)}

Catalog:
${catalogLines(catalog)}`;
}

function userPrompt(prompt: string, budgetUsd: number): string {
  return `Task: "${prompt}"\nBudget: $${budgetUsd}\nReturn the design as JSON.`;
}

/* ---------- Pipeline ---------- */

type Attempt = { task: Task; design: Design; derived: Derived; failed: number };

export async function generateDesign(prompt: string, budgetUsd: number, room: Room, catalog: Part[]): Promise<GenerateResult> {
  const contents: Content[] = [{ role: "user", parts: [{ text: userPrompt(prompt, budgetUsd) }] }];
  const config = {
    systemInstruction: systemPrompt(catalog, room),
    responseMimeType: "application/json",
    responseJsonSchema: responseSchema(catalog, room),
    temperature: 0.4,
  };

  const repairNotes: string[] = [];
  let best: Attempt | null = null;
  let attempts = 0;

  for (let round = 0; round <= MAX_REPAIRS; round++) {
    attempts++;
    const res = await generateWithFallback({ model: MODELS.GENERATE, contents, config });
    const text = res.text ?? "";
    contents.push({ role: "model", parts: [{ text }] });

    const parsed = GeminiDesign.safeParse(safeJson(text));
    if (!parsed.success) {
      const note = `Your last reply was not valid JSON for the schema: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}.`;
      repairNotes.push(note);
      contents.push({ role: "user", parts: [{ text: `${note} Reply again with the full design.` }] });
      continue;
    }

    const attempt = toAttempt(parsed.data, prompt, budgetUsd, room, catalog);
    if (!best || attempt.failed < best.failed) best = attempt;
    if (attempt.failed === 0) break;

    const failures = failureText(attempt.derived);
    repairNotes.push(failures);
    contents.push({
      role: "user",
      parts: [{ text: `The design failed these checks:\n${failures}\nFix them by changing parts and reply with the full corrected design as JSON.` }],
    });
  }

  if (!best) throw new Error("Gemini did not return a usable design after repairs.");
  const sim = simulate(best.design, best.task, room, catalog);
  return { task: best.task, design: best.design, derived: best.derived, sim, attempts, repairNotes, source: "gemini" };
}

function toAttempt(g: z.infer<typeof GeminiDesign>, prompt: string, budgetUsd: number, room: Room, catalog: Part[]): Attempt {
  const reasons: Record<string, string> = {};
  for (const r of g.reasons) if (g.partIds.includes(r.partId)) reasons[r.partId] = r.reason;
  const design = Design.parse({ summary: g.summary, partIds: g.partIds, reasons, routine: g.routine, budgetUsd });
  const validTargets = new Set(room.targets.map((t) => t.id));
  const task: Task = { prompt, targetIds: g.targetIds.filter((id) => validTargets.has(id)) };
  const derived = deriveAndCheck(design, task, room, catalog);
  // A missing reason is a soft problem; surface it as a check so the UI shows it.
  const missing = design.partIds.filter((id) => !reasons[id]);
  if (missing.length) derived.checks.push({ id: "reasons", ok: false, message: `No reason given for: ${missing.join(", ")}.` });
  return { task, design, derived, failed: derived.checks.filter((c) => !c.ok).length };
}

function safeJson(text: string): unknown {
  try {
    return parseJsonText(text);
  } catch {
    return null;
  }
}

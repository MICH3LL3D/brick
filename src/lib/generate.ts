// Prompt -> robot design, for any task (no room needed).
// Step 1: Gemini estimates what the task physically needs (requirements.ts).
// Step 2: Gemini picks parts (schema-locked to catalog ids) to meet those needs and writes reasons.
// Code checks everything and feeds failures back for up to MAX_REPAIRS repair rounds.
import "server-only";
import type { Content } from "@google/genai";
import { z } from "zod";
import { Design, Requirements, RoutineStep, type Part } from "./contracts";
import type { Derived, Room, SimResult, Task } from "./data";
import { failureText } from "./derive";
import { checkWithReasons, designGuidance, preRepair, unmetArmNeeds } from "./designHelpers";
import { generateWithFallback, parseJsonText } from "./gemini";
import { GENERATE_THINKING, MODELS } from "./models";
import { impossibleNeeds, REQUIREMENTS_JSON_SCHEMA, REQUIREMENTS_PROMPT, type RequirementsT } from "./requirements";
import { simulate } from "./sim-stub"; // switch to "./sim" when A's sim.ts lands

export const MAX_REPAIRS = 2;
/** Stop starting new repair rounds after this long, so a request never hangs for minutes. */
export const REPAIR_DEADLINE_MS = 60_000;

export type GenerateResult = {
  task: Task;
  design: Design;
  derived: Derived;
  sim: SimResult;
  ok: boolean;               // false = repairs ran out; the failed checks are in derived.checks
  attempts: number;          // 1 = first try passed or no repair helped; up to 1 + MAX_REPAIRS
  repairNotes: string[];     // failure text sent back to Gemini on each repair, shown to the user
  source: "gemini" | "cache";
  cacheOrigin?: "gemini" | "hand-built"; // set when source is "cache"
  limitations?: string[];    // plain-English: what this robot cannot do (infeasible task, needs no catalog part meets)
};

/* ---------- Response schema (ids locked by enum) ---------- */

function responseSchema(catalog: Part[]) {
  const partEnum = catalog.map((p) => p.id);
  return {
    type: "object",
    properties: {
      summary: { type: "string", description: "One friendly sentence describing the robot and how it does the task." },
      partIds: { type: "array", items: { type: "string", enum: partEnum }, description: "Every part in the robot." },
      reasons: {
        type: "array",
        items: {
          type: "object",
          properties: { partId: { type: "string", enum: partEnum }, reason: { type: "string" } },
          required: ["partId", "reason"],
        },
        description: "One short sentence per chosen part explaining why, tied to the task.",
      },
      routine: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: RoutineStep.shape.op.options },
            target: { type: "string", description: "Short name of the place or object, e.g. 'bookshelf' or 'book'." },
            value: { type: "number", description: "mm for extend_arm, seconds for wait or pump_on." },
          },
          required: ["op"],
        },
        description: "The steps the robot runs to do the task, ending with return_home.",
      },
    },
    required: ["summary", "partIds", "reasons", "routine"],
  };
}

export const GeminiDesign = z.object({
  targetIds: z.array(z.string()).default([]),
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

export function systemPrompt(catalog: Part[]): string {
  return `You design ONE wheeled Raspberry Pi robot that can do the user's task, using only parts from the catalog below.
You are given the task's physical requirements (estimated separately). Pick parts that meet every requirement.

Rules:
- Use only the part ids listed. Never invent parts.
- The task message lists, per need, the catalog parts that meet it (computed by code). Pick from those. If a need cannot be met, use the part named as closest, never a weaker one.
- Prefer the cheapest design that meets the requirements and fits the budget. If the budget is too small, still return the design that best meets the requirements.
- Give every chosen part a one-sentence plain-English reason tied to the task.
- Wheeled robots only. If some requirement cannot be met by any catalog part, say so honestly in summary and return the closest design.
- Do not output prices or totals; code does that.
- Add only parts the task needs. No camera unless the task needs one; no tank or pump unless it dispenses liquid; no gripper unless it grips.
- The routine may only use these ops: ${RoutineStep.shape.op.options.join(", ")}. Name the place or object in target. End with return_home.

Code will check the design:
- Exactly one controller (Raspberry Pi), one chassis, at most one arm, 1-2 batteries, at least one motor driver.
- Motor channels: wheels need 2; each linear actuator arm and each DC pump (interface=gpio) needs 1 more. I2C motor HATs give 4 channels, other drivers 2.
- Any part with interface=pwm (servos, servo grippers, servo arms, pan-tilt mounts) needs the PCA9685 servo board.
- The Pi needs 5V at 3A: a 5V step-down regulator (maxCurrentA>=3) fed by a battery above 5.5V. USB power banks give only 2A, which fails.
- Battery: runtime at 80% of batteryWh vs the sum of drawW must cover the task's runtime and at least 15 minutes.
- Payload: everything except the chassis, plus carried load and a full tank, must be under the chassis maxPayloadG. Linear actuator arms weigh 600-1200 g.
- reachHeightMm: tool top = chassis height + arm liftMaxMm + 50 mm must be at least reachHeightMm.
- reachOutMm: arm reachMm max + 50 mm must be at least reachOutMm.
- gripWidthMm: a gripper with gripMaxMm at least that wide.
- liftMassG: arm armPayloadG at least liftMassG plus the gripper's mass.
- liquidMl: a pump and tank(s) holding at least liquidMl.
- needsCamera / needsDistanceSensor: include one. maxWidthMm: robot no wider.

Catalog:
${catalogLines(catalog)}`;
}

function userPrompt(prompt: string, budgetUsd: number, req: RequirementsT, impossible: string[], catalog: Part[]): string {
  return `Task: ${JSON.stringify(prompt)}
Budget: $${budgetUsd}
Requirements: ${JSON.stringify(req)}
${impossible.length ? `No catalog part can meet: ${impossible.join("; ")}. Get as close as you can (use the closest part named below) and say so in summary.
` : ""}${designGuidance(req, catalog, budgetUsd)}
Return the design as JSON.`;
}

/** Step 1: what the task physically needs. Validated with zod; throws if Gemini gives nothing usable. */
export async function extractRequirements(prompt: string): Promise<RequirementsT> {
  const res = await generateWithFallback(
    {
      model: MODELS.GENERATE,
      contents: [{ role: "user", parts: [{ text: `Task: ${JSON.stringify(prompt)}` }] }],
      config: { systemInstruction: REQUIREMENTS_PROMPT, responseMimeType: "application/json", responseJsonSchema: REQUIREMENTS_JSON_SCHEMA, temperature: 0.2 },
    },
    { ...GENERATE_CALL_BASE, accept: (r: { text?: string }) => Requirements.safeParse(safeJson(r.text ?? "")).success },
  );
  const parsed = Requirements.safeParse(safeJson(res.text ?? ""));
  if (!parsed.success) throw new Error("Gemini could not work out what this task needs. Try describing it differently.");
  return parsed.data;
}

/* ---------- Pipeline ---------- */

/**
 * Latency: the primary model is often overloaded, so each call is hedged. If it has not
 * answered after hedgeMs, the fallback starts in parallel and the first schema-valid reply wins.
 */
const GENERATE_CALL_BASE = {
  hedgeMs: 5_000,
  primaryTimeoutMs: 20_000,
  fallbackTimeoutMs: 25_000,
  configFor: (model: string) => {
    const thinkingLevel = GENERATE_THINKING[model];
    return thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {};
  },
};
const GENERATE_CALL = { ...GENERATE_CALL_BASE, accept: (res: { text?: string }) => GeminiDesign.safeParse(safeJson(res.text ?? "")).success };

export type Attempt = { task: Task; design: Design; derived: Derived; failed: number };

export async function generateDesign(prompt: string, budgetUsd: number, room: Room, catalog: Part[]): Promise<GenerateResult> {
  const req = await extractRequirements(prompt);
  const impossible = impossibleNeeds(req, catalog);
  // Arm needs each possible alone but not together (or not within budget) are treated the same way.
  const armGap = unmetArmNeeds(req, catalog, budgetUsd);
  const armGapNew = !!armGap && armGap.checkIds.some((id) => !impossible.some((n) => n.checkId === id));
  const impossibleIds = new Set([...impossible.map((n) => n.checkId), ...(armGap?.checkIds ?? [])]);
  const impossibleTexts = [...impossible.map((n) => n.text), ...(armGapNew ? [`every arm need at once (${armGap.text})`] : [])];
  const contents: Content[] = [{ role: "user", parts: [{ text: userPrompt(prompt, budgetUsd, req, impossibleTexts, catalog) }] }];
  const config = {
    systemInstruction: systemPrompt(catalog),
    responseMimeType: "application/json",
    responseJsonSchema: responseSchema(catalog),
    temperature: 0.4,
  };

  const repairNotes: string[] = [];
  let best: Attempt | null = null;
  let attempts = 0;
  const started = Date.now();

  for (let round = 0; round <= MAX_REPAIRS; round++) {
    if (round > 0 && Date.now() - started > REPAIR_DEADLINE_MS) {
      repairNotes.push("Stopped repairing: time limit reached.");
      break;
    }
    attempts++;
    const res = await generateWithFallback({ model: MODELS.GENERATE, contents, config }, GENERATE_CALL);
    const text = res.text ?? "";
    contents.push({ role: "model", parts: [{ text: text || "{}" }] }); // empty parts are rejected by the API

    const parsed = GeminiDesign.safeParse(safeJson(text));
    if (!parsed.success) {
      const note = `Your last reply was not valid JSON for the schema: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}.`;
      repairNotes.push(note);
      contents.push({ role: "user", parts: [{ text: `${note} Reply again with the full design.` }] });
      continue;
    }

    let attempt = toAttempt(parsed.data, prompt, budgetUsd, room, catalog, req);
    // Fix mechanical failures (channels, servo board, 5V supply, reasons, closest arm) in code first.
    const fixedNotes: string[] = [];
    if (attempt.failed > 0) {
      const fix = preRepair(attempt.design, attempt.derived, catalog, (d) => checkWithReasons(d, attempt.task, room, catalog), { req, impossibleIds });
      const failed = fix.derived.checks.filter((c) => !c.ok).length;
      if (fix.notes.length && failed <= attempt.failed) {
        attempt = { ...attempt, design: fix.design, derived: fix.derived, failed };
        fixedNotes.push(...fix.notes);
        repairNotes.push(...fix.notes);
      }
    }
    // Rank by failures repairs could fix first; failures no part can fix only break ties.
    const fixable = (x: Attempt) => x.derived.checks.filter((c) => !c.ok && !impossibleIds.has(c.id)).length;
    if (!best || fixable(attempt) < fixable(best) || (fixable(attempt) === fixable(best) && attempt.failed < best.failed)) best = attempt;
    if (attempt.failed === 0) break;
    // Repairs cannot fix a need no catalog part meets; stop once only those are left.
    if (attempt.derived.checks.every((c) => c.ok || impossibleIds.has(c.id))) break;

    const failures = failureText(attempt.derived);
    repairNotes.push(failures);
    const codeFix = fixedNotes.length
      ? `Code already fixed some problems:\n${fixedNotes.map((n) => `- ${n}`).join("\n")}\nThe design is now: ${JSON.stringify({ partIds: attempt.design.partIds, reasons: attempt.design.reasons })}\nStart from this design.\n`
      : "";
    contents.push({
      role: "user",
      parts: [{ text: `${codeFix}The design failed these checks:\n${failures}\n${priceHint(attempt, catalog)}Fix them by changing parts, keep the total within the $${budgetUsd} budget, and reply with the full corrected design as JSON.` }],
    });
  }

  if (!best) throw new Error("Gemini did not return a usable design after repairs.");
  const sim = simulate(best.design, best.task, room, catalog);
  const limitations = [
    ...(req.feasible ? [] : [req.notes]),
    ...impossible.map((n) => `No catalog part can handle ${n.text}.`),
    ...(armGapNew ? [`The arm cannot meet every need: ${armGap.reason}. ${chosenArmText(best, catalog)}`] : []),
  ];
  return { task: best.task, design: best.design, derived: best.derived, sim, ok: best.failed === 0, attempts, repairNotes, source: "gemini", limitations };
}

export function toAttempt(g: z.infer<typeof GeminiDesign>, prompt: string, budgetUsd: number, room: Room, catalog: Part[], req?: RequirementsT): Attempt {
  const reasons: Record<string, string> = {};
  for (const r of g.reasons) if (g.partIds.includes(r.partId)) reasons[r.partId] = r.reason;
  const design = Design.parse({ summary: g.summary, partIds: g.partIds, reasons, routine: g.routine, budgetUsd });
  const validTargets = new Set(room.targets.map((t) => t.id));
  // Room-free designs carry requirements and no room targets; the room path stays for cached demos.
  const task: Task = req ? { prompt, targetIds: [], requirements: req } : { prompt, targetIds: g.targetIds.filter((id) => validTargets.has(id)) };
  const derived = checkWithReasons(design, task, room, catalog);
  return { task, design, derived, failed: derived.checks.filter((c) => !c.ok).length };
}

/** deriveAndCheck plus a "reasons" check: every part must say why it was chosen. */
export { checkWithReasons };

/** Names the arm the final design uses, for the limitations line. */
function chosenArmText(a: Attempt, catalog: Part[]): string {
  const arm = catalog.find((p) => p.category === "arm" && a.design.partIds.includes(p.id));
  return arm ? `This design uses ${arm.id} as the closest fit.` : "This design has no arm.";
}

/** On a budget failure, list the chosen parts by price so the model can see what to swap. */
function priceHint(attempt: Attempt, catalog: Part[]): string {
  if (attempt.derived.checks.find((c) => c.id === "budget")?.ok !== false) return "";
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines = attempt.design.partIds
    .map((id) => byId.get(id))
    .filter((p): p is Part => !!p)
    .sort((a, b) => b.priceUsd - a.priceUsd)
    .map((p) => `- ${p.id} $${p.priceUsd}`);
  return `Chosen parts by price:\n${lines.join("\n")}\nSwap expensive parts for cheaper catalog parts that still pass every other check, or drop parts the task does not need.\n`;
}

function safeJson(text: string): unknown {
  try {
    return parseJsonText(text);
  } catch {
    return null;
  }
}

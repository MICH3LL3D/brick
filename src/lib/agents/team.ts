// Multi-agent design: interpreter -> specialists (two waves) -> budgeter (code) -> master -> checks.
// Same output as generateDesign (docs/briefs/8-multi-agent-design.md). Every step reports progress as plain text.
import "server-only";
import { z } from "zod";
import type { Part } from "../contracts";
import { KNOWN_OPS, RoutineStep } from "../contracts";
import type { Room, Target } from "../data";
import { approachDistanceMm, failureText, isExtendable, isPump, isTank, OBJECT_MASS_G, WATER_PER_PLANT_ML } from "../derive";
import { generateWithFallback, parseJsonText } from "../gemini";
import { catalogLines, GeminiDesign, MAX_REPAIRS, REPAIR_DEADLINE_MS, toAttempt, type Attempt, type GenerateResult } from "../generate";
import { GENERATE_THINKING, MODELS } from "../models";
import { sumUsd } from "../money";
import { simulate } from "../sim-stub"; // switch to "../sim" when A's sim.ts lands
import { optionCost, pickOptions, priceMap, type Option, type Posture } from "./budgeter";

export type Progress = (text: string) => void;
type PartCategory = Part["category"];

/* ---------- Gemini call ---------- */

const tryJson = (text: string | undefined): unknown => {
  try {
    return parseJsonText(text);
  } catch {
    return null;
  }
};

export async function ask<T>(schema: z.ZodType<T>, jsonSchema: object, system: string, user: string): Promise<T> {
  const res = await generateWithFallback(
    {
      model: MODELS.GENERATE,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0.4 },
    },
    {
      hedgeMs: 5_000,
      primaryTimeoutMs: 20_000,
      fallbackTimeoutMs: 25_000,
      accept: (r) => schema.safeParse(tryJson(r.text)).success,
      configFor: (model) => {
        const thinkingLevel = GENERATE_THINKING[model];
        return thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {};
      },
    },
  );
  return schema.parse(tryJson(res.text));
}

/* ---------- Agents ---------- */

type SpecId = "mobility" | "manipulation" | "sensing" | "power" | "routine";
type OptionSpecId = Exclude<SpecId, "routine">;

const LABEL: Record<SpecId | "master", string> = {
  mobility: "Mobility agent",
  manipulation: "Arm & tool agent",
  sensing: "Sensing agent",
  power: "Power & brain agent",
  routine: "Routine agent",
  master: "Master agent",
};
const DOING: Record<SpecId | "master", string> = {
  mobility: "choosing the drive base",
  manipulation: "choosing the arm and tool",
  sensing: "choosing sensors",
  power: "sizing the Pi, motor driver and battery",
  routine: "writing the step-by-step routine",
  master: "combining every part into one robot",
};

const OPTION_SPECS: Record<OptionSpecId, { categories: PartCategory[]; rules: string }> = {
  mobility: {
    categories: ["chassis"],
    rules: `Pick exactly one chassis.
- Payload: the chassis maxPayloadG must exceed the mass of everything else on the robot plus a full water tank. Linear actuator arms alone weigh 600-1200 g, so arms that extend need a high-payload chassis.
- The robot must fit through the doorway with 50 mm free each side.`,
  },
  manipulation: {
    categories: ["arm", "tool"],
    rules: `Pick at most one arm, plus the tools and tank the task needs. An empty list is right when the task needs no arm (for example only photographing).
- Reach: tool top = chassis height + arm liftMaxMm + 50 mm must be at least each acted target's height. The arm reachMm max + 50 must cover the approach distance.
- Water needs a pump and a tank (100 ml per plant). Pickup needs a gripper and an arm with armPayloadG of at least 700. Reach applies to every target except photograph.
- Chassis height is not known yet: assume about 100 mm.`,
  },
  sensing: {
    categories: ["sensor"],
    rules: `Pick only sensors the task needs. Photographing needs a camera (interface csi). An empty list is right otherwise; add an obstacle sensor only if it is cheap relative to the budget.`,
  },
  power: {
    categories: ["controller", "motor_driver", "power", "misc"],
    rules: `Pick exactly one controller (Raspberry Pi), at least one motor driver, 1-2 batteries, and the regulators and boards the loads below need.
- Motor channels: wheels need 2; each linear actuator arm and each DC pump (interface=gpio) needs 1 more. I2C motor HATs give 4 channels, other drivers 2.
- Any part with interface=pwm needs the PCA9685 servo board.
- The Pi needs 5V at 3A: a 5V step-down regulator (maxCurrentA>=3) fed by a battery above 5.5V. USB power banks give only 2A, which fails.
- Battery: at least 15 minutes runtime at 80% of batteryWh against the summed drawW of every part.
- Pins: the total pins of all parts must fit the Pi's 26 GPIO pins.`,
  },
};

const OWNER: Record<string, SpecId | "master"> = {
  structure: "mobility", payload: "mobility",
  reach: "manipulation", "arm-payload": "manipulation", tools: "manipulation",
  "motor-channels": "power", "pin-budget": "power", "pwm-board": "power", "power-supply": "power", battery: "power",
  routine: "routine",
};

const Brief = z.object({
  targetIds: z.array(z.string()),
  needs: z.string(),
  posture: z.enum(["tight", "normal", "generous"]),
});

const OptionsOut = z.object({
  options: z.array(z.object({
    partIds: z.array(z.string()),
    reasons: z.array(z.object({ partId: z.string(), reason: z.string() })),
    tradeoff: z.string(),
  })).min(1).max(3),
});

const MasterOut = z.object({
  summary: z.string(),
  partIds: z.array(z.string()).min(1),
  reasons: z.array(z.object({ partId: z.string(), reason: z.string() })),
});

const FactOut = z.object({ fixes: z.array(z.object({ target: z.string(), corrected: z.string() })) });

const RoutineOut = z.object({ routine: z.array(RoutineStep) });

const sliceOf = (spec: OptionSpecId, catalog: Part[]) =>
  catalog.filter((p) => {
    const tank = isTank(p);
    if (spec === "manipulation") return OPTION_SPECS.manipulation.categories.includes(p.category) || tank;
    if (spec === "power") return OPTION_SPECS.power.categories.includes(p.category) && !tank;
    return OPTION_SPECS[spec].categories.includes(p.category) && !tank;
  });

const optionsSchema = (ids: string[]) => ({
  type: "object",
  properties: {
    options: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description: "1 to 3 complete options, cheapest first. Each must meet every rule; they differ in margin, quality and price.",
      items: {
        type: "object",
        properties: {
          partIds: { type: "array", items: { type: "string", enum: ids } },
          reasons: { type: "array", items: { type: "object", properties: { partId: { type: "string", enum: ids }, reason: { type: "string" } }, required: ["partId", "reason"] } },
          tradeoff: { type: "string", description: "One sentence: what this option gives up or adds compared with the cheapest." },
        },
        required: ["partIds", "reasons", "tradeoff"],
      },
    },
  },
  required: ["options"],
});

/* ---------- Facts computed by code ---------- */

function taskFacts(targets: Target[], room: Room): string {
  if (!targets.length) return "No room targets were chosen.";
  const lines = targets.map((t) => `- ${t.id}: ${t.label}, action=${t.action}, height=${t.heightMm}mm, approach distance=${Math.round(approachDistanceMm(t, room))}mm`);
  const water = targets.filter((t) => t.action === "water").length;
  const pickup = targets.some((t) => t.action === "pickup");
  const door = Math.max(...room.doorways.map((d) => d.widthMm));
  return [
    ...lines,
    `Water needed: ${water * WATER_PER_PLANT_ML} ml. Object to carry: ${pickup ? `${OBJECT_MASS_G} g` : "none"}. Widest doorway: ${door} mm.`,
  ].join("\n");
}

const lines = (ids: string[], byId: Map<string, Part>) =>
  ids.map((i) => byId.get(i)).filter((p): p is Part => !!p).map((p) => `- ${p.id} (${p.category}) ${p.name} $${p.priceUsd}`).join("\n") || "(none)";

function loadFacts(chosen: Part[]): string {
  const channels = 2 + chosen.filter((p) => (isExtendable(p) || isPump(p)) && p.caps.interface === "gpio").length;
  const pwm = chosen.filter((p) => p.caps.interface === "pwm").length;
  const draw = sumUsd(chosen.map((p) => p.caps.drawW ?? 0)); // sumUsd is a cents-safe sum; fine for watts
  const mass = chosen.reduce((s, p) => s + p.massG, 0);
  return `Loads so far (excluding the Pi, driver, battery and regulator): ${channels} motor channels needed, ${pwm} PWM parts${pwm ? " (PCA9685 needed)" : ""}, ${draw} W, ${mass} g.`;
}

/* ---------- Pipeline ---------- */

type Team = Partial<Record<OptionSpecId, Option[]>> & { routine?: z.infer<typeof RoutineOut>["routine"] };

export async function generateTeamDesign(prompt: string, budgetUsd: number, room: Room, catalog: Part[], say: Progress = () => {}): Promise<GenerateResult> {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const price = priceMap(catalog);
  const names = (ids: string[]) => ids.map((i) => byId.get(i)?.name ?? i).join(", ") || "nothing extra";
  const started = Date.now();

  /* 0. Interpreter */
  say("Reading your task and the room…");
  const targetIds = room.targets.map((t) => t.id);
  const brief = await ask(
    Brief,
    {
      type: "object",
      properties: {
        targetIds: { type: "array", items: { type: "string", enum: targetIds }, description: "Room targets the task acts on, in visit order. Empty if none fit." },
        needs: { type: "string", description: "One sentence on what the robot must be able to do." },
        posture: { type: "string", enum: ["tight", "normal", "generous"], description: "tight if the user wants it cheap, generous if they want it nice, else normal." },
      },
      required: ["targetIds", "needs", "posture"],
    },
    `You read a household task and say what a wheeled Raspberry Pi robot must do. Pick targetIds from the room targets:\n${room.targets.map((t) => `- ${t.id}: ${t.label}, action=${t.action}`).join("\n")}`,
    `Task: "${prompt}"\nBudget: $${budgetUsd}`,
  );
  const targets = room.targets.filter((t) => brief.targetIds.includes(t.id));
  const facts = taskFacts(targets, room);
  say(targets.length ? `Task understood: ${targets.map((t) => t.label).join(", ")}. ${brief.needs}` : `Task understood. ${brief.needs}`);

  const team: Team = {};
  const feedback: Partial<Record<SpecId | "master", string>> = {};
  let best: Attempt | null = null;
  let attempts = 0;
  const repairNotes: string[] = [];

  const header = (extra = "") => `Task: "${prompt}"\nBudget: $${budgetUsd}\nWhat the robot must do: ${brief.needs}\nFacts:\n${facts}\n${extra}`;
  const withFeedback = (id: SpecId | "master", text: string) =>
    feedback[id] ? `${text}\nYour last answer failed these checks. Fix them:\n${feedback[id]}\n` : text;

  async function runOptions(spec: OptionSpecId, extra: string) {
    const slice = sliceOf(spec, catalog);
    say(`${LABEL[spec]}: ${DOING[spec]}…`);
    const system = `You are the ${LABEL[spec]} on a team designing ONE wheeled Raspberry Pi robot. Use only the part ids listed; never invent parts. You are responsible only for these parts.\n${OPTION_SPECS[spec].rules}\nGive every chosen part a one-sentence plain-English reason. Do not output prices or totals.\n\nYour catalog:\n${catalogLines(slice)}`;
    const out = await ask(OptionsOut, optionsSchema(slice.map((p) => p.id)), system, withFeedback(spec, header(extra)));
    const options = out.options.sort((a, b) => optionCost(a, price) - optionCost(b, price));
    team[spec] = options;
    say(`${LABEL[spec]}: ${names(options[0].partIds)}. ${options[0].tradeoff}`);
  }

  for (let round = 0; round <= MAX_REPAIRS; round++) {
    if (round > 0 && Date.now() - started > REPAIR_DEADLINE_MS) {
      repairNotes.push("Stopped repairing: time limit reached.");
      break;
    }
    attempts++;
    const stale = new Set<string>(Object.keys(feedback));
    const wave1: OptionSpecId[] = ["mobility", "manipulation", "sensing"];
    const redoWave1 = wave1.filter((s) => stale.has(s) || !team[s]);
    if (redoWave1.length) {
      stale.add("power");
      stale.add("routine");
    }

    /* 1. Wave 1, parallel */
    await Promise.all(redoWave1.map((s) => runOptions(s, "")));

    /* 3a. Budgeter picks wave 1, leaving room for the Pi, driver and battery */
    // shortcut: the reserve is the cheapest controller + driver + two power parts, not an exact sum; refine if designs overshoot.
    const cheapest = (cat: PartCategory, n = 1) => catalog.filter((p) => p.category === cat).map((p) => p.priceUsd).sort((a, b) => a - b).slice(0, n);
    const reserve = sumUsd([...cheapest("controller"), ...cheapest("motor_driver"), ...cheapest("power", 2)]);
    const groups = wave1.map((s) => team[s]!);
    say(`Budgeter: fitting the arm, drive base and sensors into $${budgetUsd} (${brief.posture} budget)…`);
    const pick = pickOptions(groups, budgetUsd - reserve, brief.posture as Posture, price);
    const chosen1 = wave1.flatMap((s, i) => team[s]![pick[i]].partIds);
    say(`Budgeter: picked ${names(chosen1)}.`);

    /* 2. Wave 2, parallel (needs wave 1) */
    const chosenParts = chosen1.map((i) => byId.get(i)).filter((p): p is Part => !!p);
    const wave2: Promise<void>[] = [];
    if (stale.has("power") || !team.power) {
      wave2.push(runOptions("power", `Already chosen (do not re-pick):\n${lines(chosen1, byId)}\n${loadFacts(chosenParts)}\n`));
    }
    if (stale.has("routine") || !team.routine) {
      wave2.push((async () => {
        say(`${LABEL.routine}: ${DOING.routine}…`);
        const pump = chosenParts.find(isPump);
        const out = await ask(
          RoutineOut,
          {
            type: "object",
            properties: {
              routine: {
                type: "array",
                items: {
                  type: "object",
                  properties: { op: { type: "string" }, target: { type: "string", enum: targetIds }, value: { type: "number" } },
                  required: ["op"],
                },
              },
            },
            required: ["routine"],
          },
          `You are the ${LABEL.routine} on a robot design team. Write the routine only. Preferred ops: ${KNOWN_OPS.join(", ")}. If the task needs a step none of these covers, invent a short snake_case op. Use goto <target> before acting on it, visit targets in this order: ${brief.targetIds.join(", ") || "(none)"}. Use extend_arm/retract_arm only if the arm extends. End with return_home.${pump ? ` The pump moves ${pump.caps.pumpMlPerS} ml/s; a watering needs ${WATER_PER_PLANT_ML} ml, so pump_on lasts ${Math.ceil(WATER_PER_PLANT_ML / (pump.caps.pumpMlPerS || 1))} s.` : ""}`,
          withFeedback("routine", header(`Robot parts:\n${lines(chosen1, byId)}\n`)),
        );
        team.routine = out.routine;
        say(`${LABEL.routine}: ${out.routine.length} steps written.`);
      })());
    }
    await Promise.all(wave2);

    /* Power & brain: cheapest option that the Power agent says passes (upgrades are not worth money here) */
    const power = team.power![0];

    /* 4. Master */
    const pickedWave1 = wave1.map((s, i) => ({ s, o: team[s]![pick[i]] }));
    const allIds = [...new Set([...wave1.flatMap((s) => team[s]!.flatMap((o) => o.partIds)), ...team.power!.flatMap((o) => o.partIds)])];
    const describe = (s: OptionSpecId, chosenIdx: number) =>
      team[s]!.map((o, i) => `  ${i === chosenIdx ? "[CHOSEN]" : "[option]"} ${o.partIds.join(", ") || "(none)"} | $${optionCost(o, price)} | ${o.tradeoff}`).join("\n");
    const summary = [...pickedWave1.map(({ s }, i) => `${LABEL[s]}:\n${describe(s, pick[i])}`), `${LABEL.power}:\n${describe("power", 0)}`].join("\n");
    say(`${LABEL.master}: ${DOING.master}…`);
    const masterSchema = {
      type: "object",
      properties: {
        summary: { type: "string", description: "One friendly sentence describing the robot and what it will do." },
        partIds: { type: "array", items: { type: "string", enum: allIds }, description: "Every part in the robot." },
        reasons: { type: "array", items: { type: "object", properties: { partId: { type: "string", enum: allIds }, reason: { type: "string" } }, required: ["partId", "reason"] } },
      },
      required: ["summary", "partIds", "reasons"],
    };
    const master = await ask(
      MasterOut,
      masterSchema,
      `You are the ${LABEL.master}. Specialists proposed options for one wheeled Raspberry Pi robot; code chose one marked [CHOSEN] per specialist. Return the final part list. Keep the chosen parts unless two parts clash (duplicates, wrong mounts, a tool that does not suit the sensors); then swap in another option from the SAME specialist. Never drop a part another part needs. Give every part a one-sentence reason. Do not output prices.`,
      withFeedback("master", header(`Team:\n${summary}\n`)),
    );
    // The Master may only keep chosen parts or swap in a whole option; stray parts from other options are dropped.
    const allowed = new Set(wave1.flatMap((sp, i) => team[sp]![pick[i]].partIds).concat(power.partIds));
    for (const sp of [...wave1, "power" as const]) {
      for (const o of team[sp]!) if (o.partIds.length && o.partIds.every((id) => master.partIds.includes(id))) o.partIds.forEach((id) => allowed.add(id));
    }
    master.partIds = master.partIds.filter((id) => allowed.has(id));
    say(`${LABEL.master}: ${names(master.partIds)}`);

    const reasons = new Map<string, string>();
    for (const o of [...pickedWave1.map((p) => p.o), power]) for (const r of o.reasons) reasons.set(r.partId, r.reason);
    for (const r of master.reasons) reasons.set(r.partId, r.reason);

    /* 4b. Fact-checker: every claim in the words must be backed by catalog data */
    let summaryText = master.summary;
    say("Fact-checker: comparing every claim with the catalog…");
    try {
      const finalParts = [...new Set(master.partIds)].map((i) => byId.get(i)).filter((p): p is Part => !!p);
      const claims = [`summary: ${summaryText}`, ...finalParts.map((p) => `${p.id}: ${reasons.get(p.id) ?? "(no reason)"}`)].join("\n");
      const evidence = finalParts.map((p) => `${catalogLines([p])}${p.notes ? ` | notes: ${p.notes}` : ""}`).join("\n");
      const checked = await ask(
        FactOut,
        { type: "object", properties: { fixes: { type: "array", items: { type: "object", properties: { target: { type: "string", description: "A part id, or the word summary." }, corrected: { type: "string", description: "Replacement sentence that states only what the evidence supports." } }, required: ["target", "corrected"] } } }, required: ["fixes"] },
        `You are the Fact-checker. You see one-sentence claims about a robot and the catalog data for its parts. Flag a claim ONLY if it states a number, capability, or part that the evidence contradicts or does not contain (an invented spec, a feature the part lacks, a part not in the robot). Opinions and plain rationale are fine. For each flagged claim return a corrected one-sentence replacement using only the evidence. Return an empty fixes list if every claim is supported. Do not comment on prices.`,
        `Task: "${prompt}"\nPart catalog data:\n${evidence}\n\nClaims:\n${claims}`,
      );
      const fixes = checked.fixes.filter((f) => f.target === "summary" || reasons.has(f.target));
      for (const f of fixes) {
        if (f.target === "summary") summaryText = f.corrected;
        else reasons.set(f.target, f.corrected);
      }
      say(fixes.length ? `Fact-checker: corrected ${fixes.length} unsupported claim${fixes.length > 1 ? "s" : ""}.` : "Fact-checker: every claim is supported.");
    } catch (e) {
      console.warn("[fact-checker] skipped", e);
      say("Fact-checker unavailable; continuing with code checks only.");
    }

    /* 5. Checks */
    say("Checking pins, power, payload and reach…");
    const attempt = toAttempt(
      GeminiDesign.parse({
        targetIds: brief.targetIds,
        summary: summaryText,
        partIds: master.partIds,
        reasons: [...reasons].map(([partId, reason]) => ({ partId, reason })),
        routine: team.routine ?? [],
      }),
      prompt, budgetUsd, room, catalog,
    );
    if (!best || attempt.failed < best.failed) best = attempt;
    if (attempt.failed === 0) break;

    repairNotes.push(failureText(attempt.derived));
    // Specialists already offered their cheapest option, so a budget-only miss means the catalog cannot do it for less.
    if (attempt.derived.checks.every((c) => c.ok || c.id === "budget")) break;
    for (const k of Object.keys(feedback) as (keyof typeof feedback)[]) delete feedback[k];
    const priciest = pickedWave1.reduce((a, b) => (optionCost(b.o, price) > optionCost(a.o, price) ? b : a)).s;
    for (const c of attempt.derived.checks.filter((c) => !c.ok)) {
      const owner = c.id === "budget" ? priciest : (OWNER[c.id] ?? "master");
      feedback[owner] = `${feedback[owner] ?? ""}- [${c.id}] ${c.message}\n`;
    }
    say(`Repair round ${round + 1}: asking ${[...new Set(Object.keys(feedback).map((k) => LABEL[k as SpecId | "master"]))].join(" and ")} to fix it…`);
  }

  if (!best) throw new Error("The agent team did not return a usable design.");
  const sim = simulate(best.design, best.task, room, catalog);
  return { task: best.task, design: best.design, derived: best.derived, sim, ok: best.failed === 0, attempts, repairNotes, source: "gemini" };
}

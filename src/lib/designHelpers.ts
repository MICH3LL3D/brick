// Code-side help for the design step: which catalog parts meet each need (so Gemini picks from
// qualifying parts), and deterministic fixes for mechanical check failures (so repair rounds
// only go to Gemini for real design choices).
import type { Design, Part } from "./contracts";
import type { Derived, Room, Task } from "./data";
import { deriveAndCheck, isBattery, isExtendable, isGripper, isPump, isRegulator, isServoBoard, isTank, TOOL_ALLOWANCE_MM } from "./derive";
import { catalogLimits, type RequirementsT } from "./requirements";

/** Marks reasons written by code, so the UI and the user can tell they are generic. */
export const AUTO_REASON_TAG = "(auto-filled: the model gave no reason)";

/** deriveAndCheck plus a "reasons" check: every part must say why it was chosen. */
export function checkWithReasons(design: Design, task: Task, room: Room, catalog: Part[]): Derived {
  const derived = deriveAndCheck(design, task, room, catalog);
  const missing = design.partIds.filter((id) => !design.reasons[id]);
  if (missing.length) derived.checks.push({ id: "reasons", ok: false, message: `No reason given for: ${[...new Set(missing)].join(", ")}.` });
  return derived;
}

/* ---------- Guidance: qualifying parts per need ---------- */

const usd = (n: number) => `$${Math.round(n)}`;
const cheapest = (ps: Part[]) => [...ps].sort((a, b) => a.priceUsd - b.priceUsd)[0];
const toolTop = (chassis: Part, arm: Part) => chassis.dims.h + (arm.caps.liftMaxMm ?? 0) + TOOL_ALLOWANCE_MM;
const reachOut = (arm: Part) => (arm.caps.reachMm?.max ?? 0) + TOOL_ALLOWANCE_MM;

/** Parts the robot needs besides the chassis and arm (core plus the task's tools), at their cheapest valid choice. */
function corePartsUsd(catalog: Part[], arm: Part | undefined, req: RequirementsT): number {
  const by = (f: (p: Part) => boolean) => cheapest(catalog.filter(f))?.priceUsd ?? 0;
  const pi = by((p) => p.category === "controller");
  const hat = catalog.find((p) => p.id === "md-motor-hat");
  const driver = arm && isExtendable(arm) && arm.caps.interface === "gpio" ? hat?.priceUsd ?? 0 : by((p) => p.category === "motor_driver");
  const battery = by((p) => isBattery(p) && (p.caps.outputV ?? 0) > 5.5);
  const reg = by((p) => isRegulator(p) && p.caps.outputV === 5 && (p.caps.maxCurrentA ?? 0) >= 3);
  const gripper = req.gripWidthMm > 0 ? cheapest(catalog.filter((p) => (p.caps.gripMaxMm ?? 0) >= req.gripWidthMm)) : undefined;
  const servo = arm?.caps.interface === "pwm" || gripper?.caps.interface === "pwm" ? by(isServoBoard) : 0;
  const camera = req.needsCamera ? by((p) => p.category === "sensor" && p.caps.interface === "csi") : 0;
  const sensor = req.needsDistanceSensor ? by((p) => p.category === "sensor" && p.caps.interface === "gpio") : 0;
  const liquid = req.liquidMl > 0 ? by((p) => isPump(p) && p.caps.interface === "gpio") + by((p) => (p.caps.tankMl ?? 0) >= req.liquidMl) : 0;
  return pi + driver + battery + reg + servo + (gripper?.priceUsd ?? 0) + camera + sensor + liquid;
}

/** Rough mass of the non-arm parts on the deck (Pi, driver, battery, gripper, sensors). */
const OTHER_PARTS_G = 400;

/** The tallest chassis that can carry the arm and the task's load (ties go to the cheaper one). */
function bestChassisFor(arm: Part, chassis: Part[], loadG: number): Part | undefined {
  return [...chassis]
    .filter((c) => (c.caps.maxPayloadG ?? 0) >= arm.massG + OTHER_PARTS_G + loadG)
    .sort((a, b) => b.dims.h - a.dims.h || a.priceUsd - b.priceUsd)[0];
}

type ArmOption = { arm: Part; chassis: Part; top: number; out: number; lift: number; estUsd: number; score: number; meetsAll: boolean };

/** Every arm on its best chassis, scored by how much of the arm needs it covers (1 = all met). */
export function armOptions(req: RequirementsT, catalog: Part[]): ArmOption[] {
  const chassis = catalog.filter((p) => p.category === "chassis");
  const lightestGripper = req.gripWidthMm > 0 ? Math.min(...catalog.filter(isGripper).map((p) => p.massG)) : 0;
  const liftNeed = req.liftMassG > 0 ? req.liftMassG + (Number.isFinite(lightestGripper) ? lightestGripper : 0) : 0;
  const out: ArmOption[] = [];
  for (const arm of catalog.filter((p) => p.category === "arm")) {
    const c = bestChassisFor(arm, chassis, req.carryMassG + req.liquidMl);
    if (!c) continue;
    const top = toolTop(c, arm);
    const o = reachOut(arm);
    const lift = arm.caps.armPayloadG ?? 0;
    const parts: number[] = [];
    if (req.reachHeightMm > 0) parts.push(Math.min(1, top / req.reachHeightMm));
    if (req.reachOutMm > 0) parts.push(Math.min(1, o / req.reachOutMm));
    if (liftNeed > 0) parts.push(Math.min(1, lift / liftNeed));
    const score = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 1;
    out.push({ arm, chassis: c, top, out: o, lift, estUsd: arm.priceUsd + c.priceUsd + corePartsUsd(catalog, arm, req), score, meetsAll: score >= 1 });
  }
  return out.sort((a, b) => b.score - a.score || a.estUsd - b.estUsd);
}

/**
 * Arm needs that no single arm can meet together within the budget (each may be possible alone).
 * Their checks are treated like impossible needs: code swaps to the closest arm, repairs skip them.
 */
export function unmetArmNeeds(req: RequirementsT, catalog: Part[], budgetUsd: number): { checkIds: string[]; reason: string; text: string } | null {
  const checkIds = [
    req.reachHeightMm > 0 && "reach-height",
    req.reachOutMm > 0 && "reach-out",
    req.liftMassG > 0 && "arm-payload",
  ].filter((x): x is string => !!x);
  if (!checkIds.length) return null;
  const opts = armOptions(req, catalog);
  const all = opts.filter((o) => o.meetsAll);
  if (all.some((o) => o.estUsd <= budgetUsd)) return null;
  const closest = opts.find((o) => o.estUsd <= budgetUsd) ?? opts[0];
  const reason = all.length ? `no arm that does it all fits the $${budgetUsd} budget` : "no single catalog arm does it all";
  return { checkIds, reason, text: `${reason}; the closest is ${closest ? `${closest.arm.id} (tool top ${closest.top} mm, reach ${closest.out} mm, lifts ${closest.lift} g)` : "none"}` };
}

function armLine(o: ArmOption, budgetUsd: number): string {
  const fits = o.estUsd <= budgetUsd ? "fits budget" : "OVER budget";
  return `${o.arm.id} on ${o.chassis.id}: tool top ${o.top} mm, reach out ${o.out} mm, lifts ${o.lift} g, about ${usd(o.estUsd)} for the whole build (${fits})`;
}

/**
 * Plain lines naming the catalog parts that meet each requirement, computed from the catalog.
 * When nothing meets a need, names the part that gets closest.
 */
export function needOptions(req: RequirementsT, catalog: Part[], budgetUsd: number): string[] {
  const lines: string[] = [];
  const ids = (ps: Part[]) => ps.map((p) => `${p.id} (${usd(p.priceUsd)})`).join(", ");
  const armNeeded = req.reachHeightMm > 0 || req.reachOutMm > 0 || req.liftMassG > 0;

  if (armNeeded) {
    const opts = armOptions(req, catalog);
    const all = opts.filter((o) => o.meetsAll);
    const affordable = opts.filter((o) => o.estUsd <= budgetUsd);
    const needs = [
      req.reachHeightMm > 0 && `tool top >= ${req.reachHeightMm} mm`,
      req.reachOutMm > 0 && `reach out >= ${req.reachOutMm} mm`,
      req.liftMassG > 0 && `lift >= ${req.liftMassG} g plus gripper`,
    ].filter(Boolean).join(", ");
    if (all.length) {
      lines.push(`Arms meeting every arm need (${needs}):`, ...all.map((o) => `  - ${armLine(o, budgetUsd)}`));
      const best = affordable[0];
      if (!all.some((o) => o.estUsd <= budgetUsd) && best)
        lines.push(`  None of these fits the $${budgetUsd} budget. Closest within budget: ${armLine(best, budgetUsd)}.`);
    } else {
      lines.push(`No arm meets every arm need (${needs}). Closest first:`, ...opts.slice(0, 3).map((o) => `  - ${armLine(o, budgetUsd)}`));
      const best = affordable[0];
      if (best) lines.push(`  Use ${best.arm.id} on ${best.chassis.id}: it gets closest within the budget. Do not pick a shorter or weaker arm.`);
    }
    const pick = (all.find((o) => o.estUsd <= budgetUsd) ?? affordable[0] ?? opts[0])?.arm;
    if (pick && isExtendable(pick) && pick.caps.interface === "gpio")
      lines.push(`  ${pick.id} is a DC linear actuator: wheels (2) + actuator (1) = 3 motor channels, so use md-motor-hat (4 channels), not a 2-channel driver.`);
    if (pick?.caps.interface === "pwm") lines.push(`  ${pick.id} uses servos: add servo-pca9685.`);
  }
  if (req.gripWidthMm > 0) {
    const g = catalog.filter((p) => (p.caps.gripMaxMm ?? 0) >= req.gripWidthMm);
    const widest = [...catalog.filter(isGripper)].sort((a, b) => (b.caps.gripMaxMm ?? 0) - (a.caps.gripMaxMm ?? 0))[0];
    lines.push(g.length
      ? `Grippers opening >= ${req.gripWidthMm} mm: ${ids(g)}.${g.some((p) => p.caps.interface === "pwm") ? " Servo grippers need servo-pca9685." : ""}`
      : `No gripper opens ${req.gripWidthMm} mm; closest is ${widest?.id} (${widest?.caps.gripMaxMm} mm).`);
  }
  if (req.liquidMl > 0) {
    const tanks = catalog.filter(isTank);
    const one = tanks.filter((t) => (t.caps.tankMl ?? 0) >= req.liquidMl);
    const pumps = catalog.filter(isPump);
    lines.push(one.length
      ? `Tanks holding >= ${req.liquidMl} ml: ${ids(one)}.`
      : `No single tank holds ${req.liquidMl} ml; the biggest is ${[...tanks].sort((a, b) => (b.caps.tankMl ?? 0) - (a.caps.tankMl ?? 0))[0]?.id}. Two tanks add up.`);
    lines.push(`Pumps: ${pumps.map((p) => `${p.id} (${usd(p.priceUsd)}, ${p.caps.interface === "gpio" ? "DC: needs 1 motor channel" : "servo: needs servo-pca9685"})`).join(", ")}.`);
  }
  const chassis = catalog.filter((p) => p.category === "chassis");
  if (req.maxWidthMm > 0) {
    const narrow = chassis.filter((c) => c.dims.w <= req.maxWidthMm);
    lines.push(narrow.length
      ? `Chassis no wider than ${req.maxWidthMm} mm: ${ids(narrow)}. Deck parts must also fit that width.`
      : `No chassis is ${req.maxWidthMm} mm or narrower; the narrowest is ${[...chassis].sort((a, b) => a.dims.w - b.dims.w)[0]?.id}.`);
  }
  if (req.carryMassG > 0) {
    const strong = chassis.filter((c) => (c.caps.maxPayloadG ?? 0) >= req.carryMassG + 500);
    if (strong.length) lines.push(`Chassis that carry ${req.carryMassG} g plus parts: ${ids(strong)}.`);
  }
  if (req.needsCamera) lines.push(`Camera: ${cheapest(catalog.filter((p) => p.category === "sensor" && p.caps.interface === "csi"))?.id} is the cheapest.`);
  if (req.needsDistanceSensor) lines.push(`Distance sensors: ${ids(catalog.filter((p) => p.category === "sensor" && p.caps.interface === "gpio"))}.`);
  return lines;
}

/** Catalog limits plus the qualifying parts for each need, for the design prompt. */
export function designGuidance(req: RequirementsT, catalog: Part[], budgetUsd: number): string {
  const lim = catalogLimits(catalog);
  const limits = `Catalog limits (best any build can do): tool top ${lim.toolTopMm} mm, reach out ${lim.reachOutMm} mm, grip ${lim.gripMm} mm, arm lift ${lim.liftG} g, chassis payload ${lim.carryG} g, tank ${lim.tankMl} ml.`;
  const opts = needOptions(req, catalog, budgetUsd);
  const core = `Core every robot needs: one Raspberry Pi, one chassis, a motor driver with enough channels, a battery above 5.5V (e.g. bat-nimh-2200) feeding reg-5v-3a for the Pi.`;
  return [limits, core, ...(opts.length ? ["Parts that meet this task's needs (computed by code from the catalog; pick from these):", ...opts] : [])].join("\n");
}

/* ---------- Deterministic pre-repair ---------- */

const GENERIC_REASON: Partial<Record<Part["category"], string>> = {
  chassis: "Carries the robot and drives it around.",
  controller: "Runs the robot's program.",
  motor_driver: "Lets the Pi drive the motors.",
  power: "Powers the robot.",
  sensor: "Lets the robot sense its surroundings.",
  arm: "Moves the tool to where the task happens.",
  tool: "Does the hands-on part of the task.",
  misc: "Supports the other parts.",
};

export type PreRepair = { design: Design; derived: Derived; notes: string[] };

/**
 * Fixes mechanical, unambiguous failures in code: motor channels, servo board, 5V supply,
 * missing reasons, and (for needs no part can fully meet) swapping to the arm that gets closest.
 * `check` re-runs every check on a design. Returns the input unchanged when nothing applies.
 */
export function preRepair(
  design: Design,
  derived: Derived,
  catalog: Part[],
  check: (d: Design) => Derived,
  opts: { req?: RequirementsT; impossibleIds?: Set<string> } = {},
): PreRepair {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const notes: string[] = [];
  let d = fixSupport(design, derived, byId, notes);
  let cur = d === design ? derived : check(d);

  if (opts.req && opts.impossibleIds?.size) {
    const swapped = closestArmSwap(d, cur, catalog, byId, check, opts.req, opts.impossibleIds);
    if (swapped) {
      notes.push(swapped.note);
      d = swapped.design;
      cur = swapped.derived;
    }
  }

  const cheaper = cheaperEquivalents(d, cur, catalog, check);
  if (cheaper) {
    notes.push(...cheaper.notes);
    d = cheaper.design;
    cur = cheaper.derived;
  }

  const missing = [...new Set(d.partIds.filter((id) => !d.reasons[id]))];
  if (missing.length) {
    const reasons = { ...d.reasons };
    for (const id of missing) reasons[id] = `${GENERIC_REASON[byId.get(id)?.category ?? "misc"] ?? "Part of the build."} ${AUTO_REASON_TAG}`;
    d = { ...d, reasons };
    cur = check(d);
    notes.push(`Code filled a generic reason for ${missing.join(", ")} because the model gave none.`);
  }
  return { design: d, derived: cur, notes };
}

const failedIds = (derived: Derived) => new Set(derived.checks.filter((c) => !c.ok).map((c) => c.id));

/**
 * Over budget: swap parts for cheaper ones of the same category and interface (pi5 to pi4b,
 * reg-5v-5a to reg-5v-3a, arm-lact10p to arm-lact4p, ...), biggest saving first, keeping a swap
 * only if it adds no failed check. Stops once the budget passes.
 */
function cheaperEquivalents(design: Design, derived: Derived, catalog: Part[], check: (d: Design) => Derived): PreRepair | null {
  if (!failedIds(derived).has("budget")) return null;
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let d = design;
  let cur = derived;
  const notes: string[] = [];
  for (let guard = 0; guard < 12 && failedIds(cur).has("budget"); guard++) {
    const before = failedIds(cur);
    const swaps = [...new Set(d.partIds)]
      .map((id) => byId.get(id))
      .filter((p): p is Part => !!p)
      .flatMap((p) => catalog
        .filter((q) => q.category === p.category && q.caps.interface === p.caps.interface && q.priceUsd < p.priceUsd)
        .map((q) => ({ from: p, to: q, saving: p.priceUsd - q.priceUsd })))
      .sort((a, b) => b.saving - a.saving);
    let applied = false;
    for (const s of swaps) {
      const i = d.partIds.indexOf(s.from.id);
      const partIds = d.partIds.map((id, j) => (j === i ? s.to.id : id));
      const reasons = { ...d.reasons };
      if (!partIds.includes(s.from.id)) delete reasons[s.from.id];
      reasons[s.to.id] ??= `Cheaper stand-in for ${s.from.id} that still passes every check. ${d.reasons[s.from.id] ?? ""}`.trim();
      const cand = { ...d, partIds, reasons };
      const der = check(cand);
      if ([...failedIds(der)].some((id) => !before.has(id))) continue;
      notes.push(`Code swapped ${s.from.id} for ${s.to.id} because the design was over budget and ${s.to.id} saves $${s.saving.toFixed(2)} without failing any other check.`);
      d = cand;
      cur = der;
      applied = true;
      break;
    }
    if (!applied) break;
  }
  return notes.length ? { design: d, derived: cur, notes } : null;
}

/** Motor channels, servo board and 5V supply. Mutates nothing; returns the same design if no change. */
function fixSupport(design: Design, derived: Derived, byId: Map<string, Part>, notes: string[]): Design {
  const failed = failedIds(derived);
  let ids = [...design.partIds];
  const reasons = { ...design.reasons };
  const parts = () => ids.map((id) => byId.get(id)).filter((p): p is Part => !!p);
  const add = (id: string, reason: string, note: string) => {
    if (!byId.has(id)) return;
    ids.push(id);
    reasons[id] ??= reason;
    notes.push(note);
  };

  if (failed.has("motor-channels")) {
    const drivers = parts().filter((p) => p.category === "motor_driver");
    const need = (parts().some((p) => p.category === "chassis") ? 2 : 0)
      + parts().filter((p) => (isExtendable(p) || isPump(p)) && p.caps.interface === "gpio").length;
    if (drivers.length === 1 && drivers[0].caps.interface !== "i2c" && need <= 4 && byId.has("md-motor-hat")) {
      const old = drivers[0].id;
      ids = ids.map((id) => (id === old ? "md-motor-hat" : id));
      delete reasons[old];
      reasons["md-motor-hat"] ??= `Gives ${need} motor channels: 2 for the wheels plus ${need - 2} for the actuator or pump.`;
      notes.push(`Code swapped ${old} for md-motor-hat because the robot needs ${need} motor channels and ${old} has only 2.`);
    }
  }

  if (failed.has("pwm-board") && !parts().some(isServoBoard)) {
    const pwm = parts().filter((p) => p.caps.interface === "pwm").map((p) => p.id);
    add("servo-pca9685", `Drives the servos in ${pwm.join(", ")}.`, `Code added servo-pca9685 because ${pwm.join(", ")} use servos and the Pi cannot drive them itself.`);
  }

  if (failed.has("power-supply") && parts().some((p) => p.category === "controller")) {
    const regs = parts().filter((p) => isRegulator(p) && p.caps.outputV === 5 && (p.caps.maxCurrentA ?? 0) >= 3);
    if (!regs.length) {
      const weak = parts().filter((p) => isRegulator(p)).map((p) => p.id);
      ids = ids.filter((id) => !weak.includes(id));
      for (const w of weak) delete reasons[w];
      add("reg-5v-3a", "Steps the battery down to 5V at 3A for the Raspberry Pi.",
        `Code ${weak.length ? `replaced ${weak.join(", ")} with` : "added"} reg-5v-3a because the Pi needs 5V at 3A.`);
    }
    if (!parts().some((p) => isBattery(p) && (p.caps.outputV ?? 0) > 5.5) && byId.has("bat-nimh-2200")) {
      const low = parts().filter((p) => isBattery(p) && (p.caps.outputV ?? 0) <= 5.5).map((p) => p.id);
      const drop = low[0];
      if (drop) {
        ids = ids.map((id) => (id === drop ? "bat-nimh-2200" : id));
        delete reasons[drop];
      } else ids.push("bat-nimh-2200");
      reasons["bat-nimh-2200"] ??= "A 7.2V pack that feeds the 5V regulator for the Pi and powers the motors.";
      notes.push(`Code ${drop ? `replaced ${drop} with` : "added"} bat-nimh-2200 because the 5V regulator needs a battery above 5.5V${drop ? ` and ${drop} gives only ${byId.get(drop)?.caps.outputV}V` : ""}.`);
    }
  }

  const changed = ids.length !== design.partIds.length || ids.some((id, i) => id !== design.partIds[i]);
  return changed ? { ...design, partIds: ids, reasons } : design;
}

/**
 * For arm needs no part can fully meet, the model may stop at a weak arm (checks cannot pass anyway).
 * Try every arm (on the current or any chassis) and keep the one that gets closest without adding
 * any new failed check (budget included).
 */
function closestArmSwap(
  design: Design,
  derived: Derived,
  catalog: Part[],
  byId: Map<string, Part>,
  check: (d: Design) => Derived,
  req: RequirementsT,
  impossible: Set<string>,
): { design: Design; derived: Derived; note: string } | null {
  const armIds = ["reach-height", "reach-out", "arm-payload"].filter((id) => impossible.has(id));
  if (!armIds.length) return null;
  const parts = design.partIds.map((id) => byId.get(id)).filter((p): p is Part => !!p);
  const curArm = parts.find((p) => p.category === "arm");
  const curChassis = parts.find((p) => p.category === "chassis");
  if (!curChassis) return null;
  const gripG = parts.find(isGripper)?.massG ?? 0;
  const score = (c: Part, a?: Part) => {
    let s = 0;
    if (armIds.includes("reach-height")) s += Math.min(1, (c.dims.h + (a?.caps.liftMaxMm ?? 0) + TOOL_ALLOWANCE_MM) / req.reachHeightMm);
    if (armIds.includes("reach-out")) s += Math.min(1, ((a?.caps.reachMm?.max ?? 0) + TOOL_ALLOWANCE_MM) / req.reachOutMm);
    if (armIds.includes("arm-payload")) s += Math.min(1, (a?.caps.armPayloadG ?? 0) / (req.liftMassG + gripG));
    return s;
  };
  const before = failedIds(derived);
  const fixable = (der: Derived) => [...failedIds(der)].filter((id) => !impossible.has(id)).length;
  // Rank: fewest fixable failures, then closest to the arm needs, then cheapest.
  type Rank = { f: number; s: number; usd: number };
  const better = (a: Rank, b: Rank) => (a.f !== b.f ? a.f < b.f : Math.abs(a.s - b.s) > 1e-9 ? a.s > b.s : a.usd < b.usd);
  const current: Rank = { f: fixable(derived), s: score(curChassis, curArm), usd: derived.totalUsd };
  let best: (Rank & { design: Design; derived: Derived; arm: Part; chassis: Part }) | null = null;

  for (const arm of catalog.filter((p) => p.category === "arm")) {
    for (const chassis of catalog.filter((p) => p.category === "chassis")) {
      const s = score(chassis, arm);
      let ids = design.partIds.filter((id) => id !== curArm?.id).map((id) => (id === curChassis.id ? chassis.id : id));
      ids = [...ids, arm.id];
      const reasons = { ...design.reasons };
      if (curArm) delete reasons[curArm.id];
      reasons[arm.id] = `Gets the tool closest to what the task needs (no catalog arm fully meets it).`;
      if (chassis.id !== curChassis.id) {
        delete reasons[curChassis.id];
        reasons[chassis.id] = design.reasons[curChassis.id] ?? "Carries the arm and drives the robot.";
      }
      let cand: Design = { ...design, partIds: ids, reasons };
      let der = check(cand);
      const fixed = fixSupport(cand, der, byId, []);
      if (fixed !== cand) {
        cand = fixed;
        der = check(cand);
      }
      if (before.has("budget") && failedIds(der).has("budget") && der.totalUsd > derived.totalUsd) continue; // never dig deeper over budget
      const c = { design: cand, derived: der, f: fixable(der), s, usd: der.totalUsd, arm, chassis };
      if (better(c, current) && (!best || better(c, best))) best = c;
    }
  }
  if (!best) return null;
  const what = `${best.arm.id}${best.chassis.id !== curChassis.id ? ` on ${best.chassis.id}` : ""}`;
  return {
    design: best.design,
    derived: best.derived,
    note: `Code swapped ${curArm ? curArm.id : "no arm"} for ${what} because no catalog arm meets every need within the budget and ${what} gets closest while passing the other checks it can.`,
  };
}

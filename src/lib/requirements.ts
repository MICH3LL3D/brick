// Room-free design: Gemini estimates what a task physically needs, code checks parts against it.
import type { Part } from "./contracts";
import { Requirements } from "./contracts";
import type { Check } from "./data";
import { horizontalReachMm, isCamera, isGripper, isPump, isTank, toolTopMm, TOOL_ALLOWANCE_MM, type Resolved } from "./derive";
import { z } from "zod";

export type RequirementsT = z.infer<typeof Requirements>;

/** JSON schema handed to Gemini for the requirements step. Mirrors contracts.Requirements. */
export const REQUIREMENTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    feasible: { type: "boolean", description: "True if a small wheeled ground robot (under ~1 m tall) could do this task." },
    notes: { type: "string", description: "One or two plain sentences: what the robot must do and any honest limitation." },
    actions: { type: "array", items: { type: "string" }, description: "Short verbs for what the robot does, e.g. 'pick up', 'carry', 'water', 'photograph'." },
    reachHeightMm: { type: "number", description: "Highest point above the floor the tool must touch or reach. 0 if no reaching." },
    reachOutMm: { type: "number", description: "How far past the robot's front edge the tool must reach (e.g. into a shelf). 0 if none." },
    gripWidthMm: { type: "number", description: "Width of the object the gripper must close around. 0 if nothing is gripped." },
    liftMassG: { type: "number", description: "Mass in grams of the heaviest object the arm lifts. 0 if nothing is lifted." },
    carryMassG: { type: "number", description: "Extra mass in grams carried on the robot's deck during the task. 0 if none." },
    liquidMl: { type: "number", description: "Millilitres of liquid dispensed per mission. 0 if none." },
    needsCamera: { type: "boolean" },
    needsDistanceSensor: { type: "boolean", description: "True if the robot must avoid obstacles or measure distance." },
    maxWidthMm: { type: "number", description: "Maximum robot width if the task implies a limit (e.g. under furniture). 0 if none." },
    runtimeMin: { type: "number", description: "Minutes of runtime one mission needs." },
  },
  required: ["feasible", "notes", "actions", "reachHeightMm", "reachOutMm", "gripWidthMm", "liftMassG", "carryMassG", "liquidMl", "needsCamera", "needsDistanceSensor", "maxWidthMm", "runtimeMin"],
};

export const REQUIREMENTS_PROMPT = `You are a robotics engineer. Read a household task and estimate what it PHYSICALLY needs from a small wheeled robot.
Use realistic everyday numbers (a hardcover book is ~25-40 mm thick and ~400-800 g; a bookshelf middle shelf is ~800-1200 mm high; a kitchen counter is ~900 mm; a coffee table ~450 mm; a potted plant needs ~100-200 ml of water).
Do not pick parts. Do not worry about what parts exist. Only describe the task's needs.
If the task cannot be done by a wheeled ground robot (flying, stairs, outdoors in rough terrain, very heavy objects), set feasible=false and say why in notes, but still fill the numbers for the closest reasonable version of the task.
Return ONLY JSON matching the schema.`;

/** Best value any catalog part (or combination) can reach, so impossible needs can be called out instead of repaired forever. */
export function catalogLimits(catalog: Part[]) {
  const chassis = catalog.filter((p) => p.category === "chassis");
  const arms = catalog.filter((p) => p.category === "arm");
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  return {
    toolTopMm: max(chassis.map((c) => c.dims.h)) + max(arms.map((a) => a.caps.liftMaxMm ?? 0)) + TOOL_ALLOWANCE_MM,
    reachOutMm: max(arms.map((a) => a.caps.reachMm?.max ?? 0)) + TOOL_ALLOWANCE_MM,
    gripMm: max(catalog.map((p) => p.caps.gripMaxMm ?? 0)),
    liftG: max(arms.map((a) => a.caps.armPayloadG ?? 0)),
    carryG: max(chassis.map((c) => c.caps.maxPayloadG ?? 0)),
    tankMl: max(catalog.map((p) => p.caps.tankMl ?? 0)),
  };
}

/** Needs no catalog part can meet, keyed by the check that would fail, so repairs can skip them. */
export function impossibleNeeds(req: RequirementsT, catalog: Part[]): { checkId: string; text: string }[] {
  const lim = catalogLimits(catalog);
  const out: { checkId: string; text: string }[] = [];
  const no = (checkId: string, text: string) => out.push({ checkId, text });
  if (req.reachHeightMm > lim.toolTopMm) no("reach-height", `reaching ${req.reachHeightMm} mm high (the tallest catalog build reaches ${lim.toolTopMm} mm)`);
  if (req.reachOutMm > lim.reachOutMm) no("reach-out", `reaching ${req.reachOutMm} mm out (the longest catalog arm reaches ${lim.reachOutMm} mm)`);
  if (req.gripWidthMm > lim.gripMm) no("grip", `gripping a ${req.gripWidthMm} mm object (the widest catalog gripper opens ${lim.gripMm} mm)`);
  if (req.liftMassG > lim.liftG) no("arm-payload", `lifting ${req.liftMassG} g (the strongest catalog arm lifts ${lim.liftG} g)`);
  if (req.carryMassG > lim.carryG) no("payload", `carrying ${req.carryMassG} g (the strongest catalog chassis carries ${lim.carryG} g)`);
  if (req.liquidMl > lim.tankMl) no("liquid", `holding ${req.liquidMl} ml (the biggest catalog tank holds ${lim.tankMl} ml)`);
  return out;
}

/** Task checks for a room-free design. Each message says what to change, for the repair loop. */
export function requirementChecks(r: Resolved, req: RequirementsT, ctx: { footprintW: number; runtimeMin: number }): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });
  const { parts, arm } = r;

  if (req.reachHeightMm > 0) {
    const top = toolTopMm(r);
    add("reach-height", top >= req.reachHeightMm, top >= req.reachHeightMm
      ? `The tool reaches ${top} mm high; the task needs ${req.reachHeightMm} mm.`
      : `The task needs the tool at ${req.reachHeightMm} mm but it tops out at ${top} mm (chassis height + arm lift + ${TOOL_ALLOWANCE_MM} mm). Use a taller or extendable arm, or a taller chassis.`);
  }
  if (req.reachOutMm > 0) {
    const out = horizontalReachMm(r);
    add("reach-out", out >= req.reachOutMm, out >= req.reachOutMm
      ? `The arm reaches ${out} mm out; the task needs ${req.reachOutMm} mm.`
      : `The task needs ${req.reachOutMm} mm of forward reach but the arm gives ${out} mm. Use an arm with more reach.`);
  }
  if (req.gripWidthMm > 0) {
    const gripper = parts.find(isGripper);
    const open = gripper?.caps.gripMaxMm ?? 0;
    add("grip", !!gripper && open >= req.gripWidthMm, !gripper
      ? `The task grips a ${req.gripWidthMm} mm object but the robot has no gripper. Add a gripper.`
      : open >= req.gripWidthMm
        ? `The gripper opens ${open} mm; the object is ${req.gripWidthMm} mm.`
        : `The gripper opens only ${open} mm but the object is ${req.gripWidthMm} mm wide. Use a wider gripper.`);
  }
  if (req.liftMassG > 0) {
    const gripper = parts.find(isGripper);
    const need = req.liftMassG + (gripper?.massG ?? 0);
    const cap = arm?.caps.armPayloadG ?? 0;
    add("arm-payload", !!arm && cap >= need, !arm
      ? `The task lifts a ${req.liftMassG} g object but the robot has no arm. Add an arm.`
      : cap >= need
        ? `The arm lifts ${cap} g; the object and gripper weigh about ${need} g.`
        : `The ${arm.name} lifts only ${cap} g but the object plus gripper weigh about ${need} g. Use a stronger arm.`);
  }
  if (req.liquidMl > 0) {
    const tankMl = parts.filter(isTank).reduce((s, p) => s + (p.caps.tankMl ?? 0), 0);
    const pump = parts.some(isPump);
    add("liquid", pump && tankMl >= req.liquidMl, !pump
      ? "The task dispenses liquid but the robot has no pump. Add a pump."
      : tankMl >= req.liquidMl
        ? `The tank holds ${tankMl} ml; the task needs ${req.liquidMl} ml.`
        : tankMl === 0
          ? `The task needs ${req.liquidMl} ml of liquid but there is no tank. Add a tank.`
          : `The task needs ${req.liquidMl} ml but the tank holds ${tankMl} ml. Use a bigger tank.`);
  }
  if (req.needsCamera) {
    const ok = parts.some(isCamera);
    add("camera", ok, ok ? "Has a camera." : "The task needs a camera. Add a Pi camera.");
  }
  if (req.needsDistanceSensor) {
    const ok = parts.some((p) => p.category === "sensor" && p.caps.interface === "gpio");
    add("distance-sensor", ok, ok ? "Has a distance sensor." : "The task needs obstacle sensing. Add an ultrasonic or distance sensor.");
  }
  if (req.maxWidthMm > 0) {
    add("width", ctx.footprintW <= req.maxWidthMm, ctx.footprintW <= req.maxWidthMm
      ? `The robot is ${ctx.footprintW} mm wide (limit ${req.maxWidthMm} mm).`
      : `The robot is ${ctx.footprintW} mm wide but the task allows ${req.maxWidthMm} mm. Use a narrower chassis.`);
  }
  if (req.runtimeMin > 0) {
    const ok = ctx.runtimeMin >= req.runtimeMin;
    add("mission-runtime", ok, ok
      ? `About ${Math.floor(ctx.runtimeMin)} minutes of runtime; the task needs ${req.runtimeMin}.`
      : `The task needs ${req.runtimeMin} minutes but the robot runs about ${Math.floor(ctx.runtimeMin)}. Pick a bigger battery.`);
  }
  return checks;
}

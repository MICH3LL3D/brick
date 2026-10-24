// Plain-English labels for task.requirements, shared by the Checks panel and Sprocket's context.
// Pure (no server or browser APIs), so both sides can import it.
import type { z } from "zod";
import type { Requirements } from "./contracts";

export type RequirementsT = z.infer<typeof Requirements>;
export type Need = { key: keyof RequirementsT; label: string; value: string; phrase: string }; // phrase reads in a sentence

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const shown = (n: number) => Math.round(n) > 0; // never show "0 mm"

/** Only the needs that apply (numbers that round above zero, true flags), in reading order. */
export function needsList(req: RequirementsT): Need[] {
  const out: Need[] = [];
  const add = (key: keyof RequirementsT, label: string, value: string, phrase: string) => out.push({ key, label, value, phrase });
  if (req.actions.length) add("actions", "Does", req.actions.join(", "), `to ${req.actions.join(", ")}`);
  if (shown(req.reachHeightMm)) add("reachHeightMm", "Reach up to", `${num(req.reachHeightMm)} mm high`, `to reach ${num(req.reachHeightMm)} mm high`);
  if (shown(req.reachOutMm)) add("reachOutMm", "Reach out", `${num(req.reachOutMm)} mm`, `to reach ${num(req.reachOutMm)} mm out`);
  if (shown(req.gripWidthMm)) add("gripWidthMm", "Grip an object", `${num(req.gripWidthMm)} mm wide`, `to grip a ${num(req.gripWidthMm)} mm object`);
  if (shown(req.liftMassG)) add("liftMassG", "Lift with the arm", `${num(req.liftMassG)} g`, `to lift ${num(req.liftMassG)} g with the arm`);
  if (shown(req.carryMassG)) add("carryMassG", "Carry on the deck", `${num(req.carryMassG)} g`, `to carry ${num(req.carryMassG)} g on the deck`);
  if (shown(req.liquidMl)) add("liquidMl", "Liquid per run", `${num(req.liquidMl)} ml`, `${num(req.liquidMl)} ml of liquid per run`);
  if (req.needsCamera) add("needsCamera", "Camera", "yes", "a camera");
  if (req.needsDistanceSensor) add("needsDistanceSensor", "Distance sensor", "yes", "a distance sensor");
  if (shown(req.maxWidthMm)) add("maxWidthMm", "No wider than", `${num(req.maxWidthMm)} mm`, `to be no wider than ${num(req.maxWidthMm)} mm`);
  if (shown(req.runtimeMin)) add("runtimeMin", "Runtime per run", `${num(req.runtimeMin)} min`, `about ${num(req.runtimeMin)} minutes of runtime`);
  return out;
}

/** Limitations without repeating the requirements notes (generate puts notes first when infeasible). */
export function extraLimitations(req: RequirementsT | undefined, limitations: string[] | undefined): string[] {
  const notes = req?.notes.trim();
  return (limitations ?? []).map((l) => l.trim()).filter((l) => l && l !== notes);
}

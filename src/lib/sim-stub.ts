// TEMPORARY stand-in for A's src/lib/sim.ts so /api/generate can return a SimResult today.
// Straight-line path (no A*), visits targets in order, fails events using the derive checks.
// When sim.ts lands, generate.ts switches its import to "./sim" and this file is deleted.
import type { Design, Part } from "./contracts";
import type { Room, SimResult, Task } from "./data";
import {
  actedTargets, approachDistanceMm, BATTERY_USABLE, deriveAndCheck, horizontalReachMm,
  isCamera, isGripper, isPump, resolveParts, toolTopMm,
} from "./derive";

const ACTION_S = { water: 4, pickup: 3, drop: 2, photograph: 1, touch: 1 } as const;
const OP_FOR = { water: "pump_on", pickup: "grip", drop: "release", photograph: "photograph", touch: "extend_arm" } as const;

export function simulate(design: Design, task: Task, room: Room, catalog: Part[]): SimResult {
  const r = resolveParts(design, catalog);
  const derived = deriveAndCheck(design, task, room, catalog);
  const speed = r.chassis?.caps.speedMps ? r.chassis.caps.speedMps * 0.5 : 0.2; // half no-load speed, m/s
  const drawW = r.parts.reduce((s, p) => s + (p.caps.drawW ?? 0), 0);
  const wh = r.parts.reduce((s, p) => s + (p.caps.batteryWh ?? 0), 0) * BATTERY_USABLE;
  const top = toolTopMm(r);
  const reach = horizontalReachMm(r);

  const path: SimResult["path"] = [{ x: room.home.x, y: room.home.y, t: 0 }];
  const events: SimResult["events"] = [];
  let t = 0;
  let pos = room.home;
  const driveTo = (x: number, y: number) => {
    t += Math.hypot(x - pos.x, y - pos.y) / 1000 / speed;
    pos = { x, y };
    path.push({ x, y, t: round1(t) });
  };

  for (const target of actedTargets(design, task, room)) {
    driveTo(target.x, target.y);
    let ok = true;
    let note = `${target.action} ${target.label}: done`;
    if (!r.chassis) { ok = false; note = "no chassis to drive"; }
    else if (target.action === "photograph") {
      if (!r.parts.some(isCamera)) { ok = false; note = "no camera to take the photo"; }
    } else {
      if (target.heightMm > top) { ok = false; note = `${target.label} is at ${target.heightMm} mm; tool reaches ${top} mm`; }
      else if (approachDistanceMm(target, room) > reach) { ok = false; note = `${target.label} is too far in from the edge for the arm`; }
      else if (target.action === "water" && !r.parts.some(isPump)) { ok = false; note = "no pump to water with"; }
      else if (target.action === "pickup" && !r.parts.some(isGripper)) { ok = false; note = "no gripper to pick it up"; }
    }
    t += ACTION_S[target.action];
    events.push({ t: round1(t), targetId: target.id, op: OP_FOR[target.action], ok, note });
  }
  driveTo(room.home.x, room.home.y);

  const usedWh = (drawW * t) / 3600;
  const batteryUsedPct = wh > 0 ? Math.min(100, round1((usedWh / wh) * 100)) : 100;
  if (batteryUsedPct >= 100) events.push({ t: round1(t), targetId: "home", op: "return_home", ok: false, note: "battery ran out" });

  return {
    success: events.every((e) => e.ok), // nothing to visit (room-free design) is not a failure
    checks: derived.checks,
    path,
    events,
    batteryUsedPct,
    durationS: round1(t),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

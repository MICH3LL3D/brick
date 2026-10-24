// Where each part of a design sits in 3D, computed from catalog dims (mm). Pure: no three.js here,
// so it is unit-testable and shared by every robot3d component.
//
// Frame: metres, y up, x forward (chassis length), z to the robot's left (chassis width).
// Origin is the floor under the chassis centre.
import type { Part } from "../contracts";

export type Vec3 = [number, number, number];

export type Role = "chassis" | "wheel" | "deck" | "front" | "arm" | "tool";

export type Placed = {
  key: string;        // stable React key, unique per instance (duplicates get #2, #3...)
  part: Part;
  role: Role;
  pos: Vec3;          // centre of the part's bounding box
  size: Vec3;         // [x (length), y (height), z (width)] in metres
};

export type ArmRig = {
  key: string;
  part: Part;
  mount: Vec3;           // top of the deck where the arm base stands
  extendable: boolean;   // linear actuator mast (true) or fixed servo arm (false)
  reachMinM: number;     // horizontal reach from the mount
  reachMaxM: number;
  liftMaxM: number;      // max tool height above the mount
  baseSize: Vec3;        // footprint/height of the arm body (retracted for extendable)
};

export type Wheel = { key: string; pos: Vec3; radius: number; width: number };

export type RobotLayout = {
  chassis?: Placed;
  wheels: Wheel[];
  deckY: number;          // height of the deck top
  items: Placed[];        // deck and front parts (not chassis, arm or arm-mounted tool)
  arm?: ArmRig;
  tool?: Placed;          // tool at the arm tip (pos is for the arm fully retracted; Arm moves it)
  bounds: Vec3;           // overall size, for camera framing
};

const MM = 0.001;
const GAP = 0.006; // 6 mm between packed parts
const DEFAULT_CHASSIS: Vec3 = [0.18, 0.06, 0.15];

const sizeOf = (p: Part): Vec3 => [p.dims.l * MM, p.dims.h * MM, p.dims.w * MM];

export function layoutRobot(parts: Part[]): RobotLayout {
  const seen = new Map<string, number>();
  const keyOf = (p: Part) => {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    return n === 1 ? p.id : `${p.id}#${n}`;
  };

  const chassisPart = parts.find((p) => p.category === "chassis");
  const armPart = parts.find((p) => p.category === "arm");
  const [cl, ch, cw] = chassisPart ? sizeOf(chassisPart) : DEFAULT_CHASSIS;

  /* Wheels: radius from the catalog, sitting on the floor at the chassis sides. */
  const radius = ((chassisPart?.caps.wheelDiameterMm ?? 65) * MM) / 2;
  const wheelW = Math.max(0.02, radius * 0.6);
  const nWheels = chassisPart?.caps.wheels ?? 2;
  const wheelXs = nWheels >= 4 ? [cl * 0.32, -cl * 0.32] : [0];
  const wheels: Wheel[] = [];
  for (const x of wheelXs) for (const side of [1, -1]) {
    wheels.push({ key: `wheel-${wheels.length}`, pos: [x, radius, side * (cw / 2 + wheelW / 2)], radius, width: wheelW });
  }

  // Chassis body sits with its bottom at wheel-axle height minus a bit, so wheels poke out below.
  const bodyBottom = Math.max(0.01, radius * 0.6);
  const chassis: Placed | undefined = chassisPart
    ? { key: keyOf(chassisPart), part: chassisPart, role: "chassis", pos: [0, bodyBottom + ch / 2, 0], size: [cl, ch, cw] }
    : undefined;
  const deckY = bodyBottom + ch;

  /* Arm: front-centre of the deck. */
  let arm: ArmRig | undefined;
  if (armPart) {
    const [al, ah, aw] = sizeOf(armPart);
    const reach = armPart.caps.reachMm ?? { min: 0, max: 0 };
    const extendable = reach.min < reach.max;
    const base: Vec3 = extendable ? [al, ah, aw] : [Math.min(al, cl * 0.5), Math.min(ah, 0.06), Math.min(aw, cw * 0.6)];
    arm = {
      key: keyOf(armPart),
      part: armPart,
      mount: [cl / 2 - base[0] / 2 - GAP, deckY, 0],
      extendable,
      reachMinM: reach.min * MM,
      reachMaxM: reach.max * MM,
      liftMaxM: (armPart.caps.liftMaxMm ?? 0) * MM,
      baseSize: base,
    };
  }

  /* Tool: on the arm tip if it can mount there, else on the deck. */
  const toolPart = parts.find((p) => p.category === "tool" && p.mounts.includes("tool_mount") && arm);
  let tool: Placed | undefined;
  if (toolPart && arm) {
    const s = sizeOf(toolPart);
    tool = { key: keyOf(toolPart), part: toolPart, role: "tool", pos: [arm.mount[0], arm.mount[1] + arm.baseSize[1] + s[1] / 2, 0], size: s };
  }

  /* Everything else: front-mounted sensors on the nose, the rest shelf-packed on the deck. */
  const rest = parts.filter((p) => p !== chassisPart && p !== armPart && p !== toolPart);
  const items: Placed[] = [];
  const front = rest.filter((p) => p.mounts.includes("front") && !p.mounts.includes("deck"));
  front.forEach((p, i) => {
    const s = sizeOf(p);
    const z = (i - (front.length - 1) / 2) * (s[2] + GAP);
    items.push({ key: keyOf(p), part: p, role: "front", pos: [cl / 2 + s[0] / 2, deckY - ch / 2, z], size: s });
  });

  // Shelf packing: rows run across the width (z), filling from the back (-x) toward the arm.
  const deckParts = rest.filter((p) => !front.includes(p)).sort((a, b) => b.dims.l * b.dims.w - a.dims.l * a.dims.w);
  const xMax = arm ? arm.mount[0] - arm.baseSize[0] / 2 - GAP : cl / 2;
  let x = -cl / 2 + GAP;
  let z = -cw / 2 + GAP;
  let rowDepth = 0;
  const overflow: Part[] = [];
  for (const p of deckParts) {
    const s = sizeOf(p);
    if (z + s[2] > cw / 2 + 0.001 && z > -cw / 2 + GAP) { x += rowDepth + GAP; z = -cw / 2 + GAP; rowDepth = 0; }
    if (x + s[0] > xMax + 0.001) { overflow.push(p); continue; }
    items.push({ key: keyOf(p), part: p, role: "deck", pos: [x + s[0] / 2, deckY + s[1] / 2, z + s[2] / 2], size: s });
    z += s[2] + GAP;
    rowDepth = Math.max(rowDepth, s[0]);
  }

  // Deck full: stack each leftover part on the lowest part whose top it fits on, like boards on
  // standoffs. Tall parts (tanks) are never used as a base, so nothing floats above them.
  const tops = items.map((it) => ({ it, top: it.pos[1] + it.size[1] / 2, flat: it.size[1] <= 0.05 }));
  for (const p of overflow) {
    const s = sizeOf(p);
    const fits = (t: (typeof tops)[number]) => t.flat && t.it.size[0] >= s[0] * 0.6 && t.it.size[2] >= s[2] * 0.6;
    const base = [...tops].filter(fits).sort((m, n) => m.top - n.top)[0] ?? [...tops].sort((m, n) => m.top - n.top)[0];
    const y = (base?.top ?? deckY) + GAP;
    const placed: Placed = { key: keyOf(p), part: p, role: "deck", pos: [base ? base.it.pos[0] : 0, y + s[1] / 2, base ? base.it.pos[2] : 0], size: s };
    items.push(placed);
    if (base) { base.top = y + s[1]; base.flat = s[1] <= 0.05; }
  }

  const top = Math.max(
    deckY,
    ...items.map((i) => i.pos[1] + i.size[1] / 2),
    arm ? arm.mount[1] + Math.max(arm.baseSize[1], arm.liftMaxM) : 0,
  );
  const bounds: Vec3 = [cl + (arm?.reachMaxM ?? 0), top, cw + 2 * wheelW];
  return { chassis, wheels, deckY, items, arm, tool, bounds };
}

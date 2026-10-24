// Which parts are wired to which, and where each cable starts and ends. Pure: no three.js.
import type { Placed, RobotLayout, Vec3 } from "@/lib/robot3d/layout";

export type Cable = { key: string; start: Vec3; end: Vec3; mid: Vec3 };
export type OffsetsMm = Record<string, { x: number; y: number }>;

const MM = 0.001;

/** Top-centre of a placed part, moved by the user's deck offset (mm, x forward, y left). */
function topOf(it: Placed, offsets?: OffsetsMm): Vec3 {
  const o = offsets?.[it.key] ?? { x: 0, y: 0 };
  return [it.pos[0] + o.x * MM, it.pos[1] + it.size[1] / 2, it.pos[2] + o.y * MM];
}

/** Control point above the midpoint so the cable arcs upward and reads clearly. */
function arcMid(a: Vec3, b: Vec3): Vec3 {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.015 + d * 0.3, (a[2] + b[2]) / 2];
}

export function cablesFor(layout: RobotLayout, offsets?: OffsetsMm): Cable[] {
  const items = layout.items;
  const of = (cat: string) => items.filter((it) => it.part.category === cat);
  const pi = of("controller")[0];
  const drivers = of("motor_driver");
  const power = of("power");
  const battery = power.find((it) => it.part.caps.batteryWh != null);
  const regulators = power.filter((it) => it.part.caps.batteryWh == null);

  const out: Cable[] = [];
  const add = (from: Placed, to: Placed | Vec3, toKey?: string) => {
    const a = topOf(from, offsets);
    const b = Array.isArray(to) ? to : topOf(to, offsets);
    const key = `${from.key}->${Array.isArray(to) ? toKey : to.key}`;
    out.push({ key, start: a, end: b, mid: arcMid(a, b) });
  };

  if (pi) {
    // Skip passive parts (e.g. a water tank, interface "none"): nothing to wire.
    const signal = [...drivers, ...of("sensor"), ...of("misc")].filter((it) => it.part.caps.interface !== "none");
    for (const it of signal) add(pi, it);
  }
  if (battery) {
    for (const d of drivers) add(battery, d);
    for (const r of regulators) add(battery, r);
    if (pi && regulators.length === 0) add(battery, pi); // no regulator: battery feeds the Pi directly
  }
  if (pi) for (const r of regulators) add(r, pi);

  // Motor drivers to the wheel motors (axle centre) and to the arm mount when it has a motorised mast.
  const wheelCentre: Vec3 | undefined = layout.wheels.length
    ? [
        layout.wheels.reduce((s, w) => s + w.pos[0], 0) / layout.wheels.length,
        layout.wheels[0].pos[1],
        layout.wheels.reduce((s, w) => s + w.pos[2], 0) / layout.wheels.length,
      ]
    : undefined;
  // With two or more drivers, the first runs the wheels and the second the arm; one driver does both.
  const wheelDriver = drivers[0];
  const armDriver = drivers[1] ?? drivers[0];
  if (wheelDriver && wheelCentre) add(wheelDriver, wheelCentre, "wheels");
  if (armDriver && layout.arm?.extendable) add(armDriver, layout.arm.mount, layout.arm.key);
  return out;
}

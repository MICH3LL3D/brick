// Which parts are wired to which, and where each cable starts and ends. Pure: no three.js.
import type { Placed, RobotLayout, Vec3 } from "@/lib/robot3d/layout";

/** "wire": round signal/power cable. "ribbon": flat camera (CSI) ribbon, drawn differently. */
export type CableKind = "wire" | "ribbon";
export type Cable = { key: string; kind: CableKind; start: Vec3; end: Vec3; mid: Vec3 };

/** Top-centre of a placed part. */
function topOf(it: Placed): Vec3 {
  return [it.pos[0], it.pos[1] + it.size[1] / 2, it.pos[2]];
}

/** Control point above the midpoint so the cable arcs upward and reads clearly. */
function arcMid(a: Vec3, b: Vec3, lift = 0.3): Vec3 {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.015 + d * lift, (a[2] + b[2]) / 2];
}

const isPca9685 = (it: Placed) => /pca9685/i.test(it.part.id) || /pca9685/i.test(it.part.name);

export function cablesFor(layout: RobotLayout): Cable[] {
  const items = layout.items;
  const of = (cat: string) => items.filter((it) => it.part.category === cat);
  const pi = of("controller")[0];
  const drivers = of("motor_driver");
  const power = of("power");
  const batteries = power.filter((it) => it.part.caps.batteryWh != null);
  const regulators = power.filter((it) => it.part.caps.batteryWh == null);
  const pwmBoard = of("misc").find(isPca9685);
  const servoSource = pwmBoard ?? pi;            // PWM devices hang off the PCA9685 if there is one
  const gpioSource = drivers[0] ?? pi;           // pumps and motors need a driver, else the Pi pin

  const out: Cable[] = [];
  const seen = new Set<string>();
  const add = (from: Placed | undefined, to: Placed | Vec3, toKey?: string, kind: CableKind = "wire") => {
    if (!from) return;
    const a = topOf(from);
    const b = Array.isArray(to) ? to : topOf(to);
    const key = `${from.key}->${Array.isArray(to) ? toKey : to.key}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, kind, start: a, end: b, mid: arcMid(a, b, kind === "ribbon" ? 0.15 : 0.3) });
  };

  // Signal: Pi to drivers, sensors and boards. Passive parts (interface "none", e.g. a water
  // tank) get nothing; cameras (CSI) get a flat ribbon.
  if (pi) {
    for (const it of [...drivers, ...of("sensor"), ...of("misc")]) {
      const iface = it.part.caps.interface;
      if (iface === "none") continue;
      add(pi, it, undefined, iface === "csi" ? "ribbon" : "wire");
    }
  }

  // Power: every battery feeds the drivers and regulators (or the Pi directly if no regulator).
  for (const b of batteries) {
    for (const d of drivers) add(b, d);
    for (const r of regulators) add(b, r);
    if (regulators.length === 0) add(b, pi);
  }
  if (pi) for (const r of regulators) add(r, pi);

  // Tools (on the deck or at the arm tip): PWM ones from the PCA9685/Pi, GPIO pumps from a driver.
  const tools = [...of("tool"), ...(layout.tool ? [layout.tool] : [])];
  for (const t of tools) {
    const iface = t.part.caps.interface;
    if (iface === "pwm") add(servoSource, t);
    else if (iface === "gpio") add(gpioSource, t);
    else if (iface && iface !== "none") add(pi, t);
  }

  // Motor drivers to the wheel motors (axle centre). With two or more drivers, the first runs
  // the wheels and the second the arm's linear actuator; one driver does both.
  const wheelCentre: Vec3 | undefined = layout.wheels.length
    ? [
        layout.wheels.reduce((s, w) => s + w.pos[0], 0) / layout.wheels.length,
        layout.wheels[0].pos[1],
        layout.wheels.reduce((s, w) => s + w.pos[2], 0) / layout.wheels.length,
      ]
    : undefined;
  if (drivers[0] && wheelCentre) add(drivers[0], wheelCentre, "wheels");
  const arm = layout.arm;
  if (arm) {
    if (arm.extendable) add(drivers[1] ?? drivers[0], arm.mount, arm.key);
    else if (arm.part.caps.interface === "pwm") add(servoSource, arm.mount, arm.key); // servo arm
  }
  return out;
}

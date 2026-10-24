// Deterministic checks and derived values. No Gemini calls here: code does all the math.
// Every failed check message is plain English; generate.ts feeds failures back to Gemini.
import type { Design, Part } from "./contracts";
import type { Check, Derived, Room, Target, Task } from "./data";
import { partMap } from "./data";
import { requirementChecks } from "./requirements";

/* ---------- Shared constants (sim.ts should use the same numbers) ---------- */

export const WATER_PER_PLANT_ML = 100;   // one watering
export const OBJECT_MASS_G = 550;        // a full 500 ml water bottle
export const TOOL_ALLOWANCE_MM = 50;     // nozzle or jaw sticking past the arm tip
export const DOOR_CLEARANCE_MM = 50;     // free space wanted on each side in a doorway
export const MIN_RUNTIME_MIN = 15;       // a mission must fit in this much battery
export const BATTERY_USABLE = 0.8;       // do not plan on the last 20% of a battery
export const PI_GPIO_PINS = 26;          // BCM 2-27 on the 40-pin header

/** Actions that need the tool to physically reach the target. */
const CONTACT_ACTIONS = new Set(["water", "pickup", "drop", "touch"]);

/** Pi 5V current each controller needs, in amps (Raspberry Pi recommended supply). */
const PI_SUPPLY_A: Record<string, number> = { "pi4b-4gb": 3, "pi5-4gb": 3 };

/** BCM pins handed out for GPIO parts, after I2C (2, 3) is reserved. */
const GPIO_ORDER = [17, 27, 22, 5, 6, 13, 19, 26, 12, 16, 20, 21, 23, 24, 25, 18, 4, 14, 15, 7, 8, 9, 10, 11];

/* ---------- Part helpers ---------- */

export type Resolved = {
  parts: Part[];          // one entry per partIds entry (duplicates mean quantity)
  unknownIds: string[];
  chassis?: Part;
  controller?: Part;
  arm?: Part;
};

export function resolveParts(design: Design, catalog: Part[]): Resolved {
  const byId = partMap(catalog);
  const parts: Part[] = [];
  const unknownIds: string[] = [];
  for (const id of design.partIds) {
    const p = byId.get(id);
    if (p) parts.push(p);
    else unknownIds.push(id);
  }
  return {
    parts,
    unknownIds,
    chassis: parts.find((p) => p.category === "chassis"),
    controller: parts.find((p) => p.category === "controller"),
    arm: parts.find((p) => p.category === "arm"),
  };
}

export const isBattery = (p: Part) => p.category === "power" && (p.caps.batteryWh ?? 0) > 0;
export const isRegulator = (p: Part) => p.category === "power" && !p.caps.batteryWh;
export const isTank = (p: Part) => (p.caps.tankMl ?? 0) > 0;
export const isPump = (p: Part) => (p.caps.pumpMlPerS ?? 0) > 0;
export const isGripper = (p: Part) => (p.caps.gripMaxMm ?? 0) > 0;
export const isCamera = (p: Part) => p.category === "sensor" && p.caps.interface === "csi";
export const isServoBoard = (p: Part) => p.category === "misc" && /pca9685/i.test(p.id + p.name);
/** Extendable arms (linear actuators) are DC motors and need a motor driver channel. */
export const isExtendable = (p: Part) => p.category === "arm" && !!p.caps.reachMm && p.caps.reachMm.min < p.caps.reachMm.max;
/** DC pumps switched by a driver channel (servo-controlled pumps use the PWM board instead). */
const needsMotorChannel = (p: Part) => (isExtendable(p) || isPump(p)) && p.caps.interface === "gpio";
/** I2C motor HATs carry two driver chips (4 channels); breakouts have 2. */
const driverChannels = (p: Part) => (p.caps.interface === "i2c" ? 4 : 2);
/** Batteries below this sag too far under load to feed a 5V buck regulator reliably (6V packs). */
export const MIN_REGULATOR_INPUT_V = 7;
/** Driver suggested for 12V actuators that stall above what the small drivers give. */
const HEAVY_DRIVER_ID = "md-g2-24v14";
/** Pin role names for hall-effect position feedback on a linear arm, in pin order. */
export const HALL_PIN_ROLES = ["HALL A", "HALL B", "HALL C", "HALL D"];
const hasAdcPart = (parts: Part[]) => parts.some((p) => /ads1115/i.test(p.id));

/** Height of the deck the arm stands on. */
export function deckHeightMm(r: Resolved): number {
  return r.chassis?.dims.h ?? 0;
}

/** Highest point the tool can touch. Without an arm, the tool sits on the deck. */
export function toolTopMm(r: Resolved): number {
  return deckHeightMm(r) + (r.arm?.caps.liftMaxMm ?? 0) + TOOL_ALLOWANCE_MM;
}

/** How far past the robot's front edge the tool reaches. */
export function horizontalReachMm(r: Resolved): number {
  return (r.arm?.caps.reachMm?.max ?? 0) + TOOL_ALLOWANCE_MM;
}

/**
 * Distance from the nearest free floor to the target point. A target on top of furniture is
 * acted on from beside it, so this is the distance from the target to the obstacle's nearest edge.
 */
export function approachDistanceMm(target: Target, room: Room): number {
  let worst = 0;
  for (const o of room.obstacles) {
    const inside = target.x >= o.x && target.x <= o.x + o.w && target.y >= o.y && target.y <= o.y + o.d;
    if (!inside) continue;
    const toEdge = Math.min(target.x - o.x, o.x + o.w - target.x, target.y - o.y, o.y + o.d - target.y);
    worst = Math.max(worst, toEdge);
  }
  return worst;
}

/** Targets the design acts on: the task's chosen targets plus any named in the routine. */
export function actedTargets(design: Design, task: Task, room: Room): Target[] {
  const ids = new Set([...task.targetIds, ...design.routine.map((s) => s.target).filter((t): t is string => !!t)]);
  return room.targets.filter((t) => ids.has(t.id));
}

/* ---------- Main entry ---------- */

export function deriveAndCheck(design: Design, task: Task, room: Room, catalog: Part[]): Derived {
  const r = resolveParts(design, catalog);
  const { parts, chassis, controller, arm } = r;
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });

  /* Totals and footprint */
  // Room-free designs (task.requirements) are checked against the task's needs, not room targets.
  const req = task.requirements;
  const targets = req ? [] : actedTargets(design, task, room);
  const waterTargets = targets.filter((t) => t.action === "water");
  const pickupTargets = targets.filter((t) => t.action === "pickup");
  const waterMl = waterTargets.length * WATER_PER_PLANT_ML;
  const tankMl = parts.filter(isTank).reduce((s, p) => s + (p.caps.tankMl ?? 0), 0);

  const totalUsd = round2(parts.reduce((s, p) => s + p.priceUsd, 0));
  const partsMassG = parts.reduce((s, p) => s + p.massG, 0);
  // Full tank at the start of a watering mission (1 ml of water = 1 g).
  const waterMassG = req ? (req.liquidMl > 0 ? tankMl : 0) + req.carryMassG : waterTargets.length ? tankMl : 0;
  const totalMassG = Math.round(partsMassG + waterMassG);

  const onDeck = parts.filter((p) => p.category !== "chassis");
  const footprint = {
    l: Math.max(chassis?.dims.l ?? 0, ...onDeck.map((p) => p.dims.l)),
    w: Math.max(chassis?.dims.w ?? 0, ...onDeck.map((p) => p.dims.w)),
  };

  /* 1. Part ids */
  add(
    "part-ids",
    r.unknownIds.length === 0,
    r.unknownIds.length === 0
      ? "Every part is a real catalog part."
      : `These part ids are not in the catalog: ${r.unknownIds.join(", ")}. Use only catalog ids.`,
  );

  /* 2. Structure: one controller, one chassis, a battery, a motor driver */
  const count = (cat: Part["category"]) => parts.filter((p) => p.category === cat).length;
  const batteries = parts.filter(isBattery);
  const drivers = parts.filter((p) => p.category === "motor_driver");
  const structureProblems: string[] = [];
  if (count("controller") !== 1) structureProblems.push(`needs exactly one Raspberry Pi (has ${count("controller")})`);
  if (count("chassis") !== 1) structureProblems.push(`needs exactly one chassis (has ${count("chassis")})`);
  if (count("arm") > 1) structureProblems.push(`can carry only one arm (has ${count("arm")})`);
  const gripperCount = parts.filter(isGripper).length;
  if (gripperCount > 1) structureProblems.push(`can carry only one gripper (has ${gripperCount})`);
  if (batteries.length < 1) structureProblems.push("needs a battery");
  if (batteries.length > 2) structureProblems.push(`has ${batteries.length} batteries; use one for logic and at most one for motors`);
  if (chassis && drivers.length < 1) structureProblems.push("needs a motor driver: the Pi cannot drive motors from its pins");
  add(
    "structure",
    structureProblems.length === 0,
    structureProblems.length === 0
      ? "Has one Raspberry Pi, one chassis, a battery and a motor driver."
      : `The robot ${structureProblems.join("; ")}.`,
  );

  /* 3. Motor driver channels: 2 for the wheels, plus one per actuator or DC pump */
  const channelsNeeded = (chassis ? 2 : 0) + parts.filter(needsMotorChannel).length;
  const channelsHave = drivers.reduce((s, p) => s + driverChannels(p), 0);
  // Consumers in the order the pin map hands out channel letters: wheels (left, right), then actuators and pumps.
  // A chassis's stallA is per side: one channel drives all the wheels on that side.
  const consumers: { part: Part; label: string; stallA?: number; wheels: boolean }[] = [];
  for (const p of parts) {
    if (p.category === "chassis") {
      const stallA = p.caps.stallA;
      consumers.push({ part: p, label: `${p.name} (left wheels)`, stallA, wheels: true }, { part: p, label: `${p.name} (right wheels)`, stallA, wheels: true });
    } else if (needsMotorChannel(p)) {
      consumers.push({ part: p, label: p.name, stallA: p.caps.stallA, wheels: false });
    }
  }
  // Channel letters follow the drivers in the order they are listed (same as the kit's motor setup).
  const channelSources = drivers.flatMap((d) => Array.from({ length: driverChannels(d) }, () => d));
  const heavyConsumers = consumers.filter((c) => !c.wheels && (c.stallA ?? 0) > Math.max(0, ...drivers.filter((d) => d.id !== HEAVY_DRIVER_ID).map((d) => d.caps.maxCurrentA ?? 0), 1.2));
  add(
    "motor-channels",
    channelsHave >= channelsNeeded,
    channelsHave >= channelsNeeded
      ? `Motor drivers give ${channelsHave} channels; ${channelsNeeded} needed.`
      : `Needs ${channelsNeeded} motor channels (2 for wheels, plus one per linear actuator or DC pump) but the drivers only give ${channelsHave}. ` +
        (heavyConsumers.length
          ? `Add a high-current driver such as ${HEAVY_DRIVER_ID} (2 channels, 14 A each) for ${heavyConsumers.map((c) => c.label).join(", ")}.`
          : "Add a motor driver or use a 4-channel motor HAT."),
  );

  /* 3b. Motor current: each channel must supply its consumer's stall current */
  // Actuators and pumps hold stall at their end stops, so an undersized channel fails. Wheels stall only
  // briefly (start-up, bumping a wall), so an undersized wheel channel is a warning, not a failure.
  if (consumers.some((c) => c.stallA !== undefined)) {
    const overloads: string[] = [];
    const wheelWarnings = new Set<string>();
    consumers.forEach((c, i) => {
      const driver = channelSources[i];
      if (c.stallA === undefined || !driver || driver.caps.maxCurrentA === undefined) return;
      if (driver.caps.maxCurrentA >= c.stallA) return;
      if (c.wheels) {
        wheelWarnings.add(`wheel motors can briefly pull ${round1(c.stallA)} A at stall; the ${round1(driver.caps.maxCurrentA)} A ${driver.name} may cut out under heavy load`);
      } else {
        overloads.push(`the ${c.label} can pull ${round1(c.stallA)} A but driver channel ${String.fromCharCode(65 + i)} on the ${driver.name} gives only ${round1(driver.caps.maxCurrentA)} A`);
      }
    });
    const warning = wheelWarnings.size ? ` Warning: ${[...wheelWarnings].join("; ")}.` : "";
    add(
      "motor-current",
      overloads.length === 0,
      overloads.length === 0
        ? `Every actuator and pump gets enough current from its driver channel.${warning}`
        : `${capitalize(overloads.join("; "))}. Use a ${HEAVY_DRIVER_ID} driver (14 A per channel) for 12V actuators.${warning}`,
    );
  }

  /* 3c. Linear arm position feedback */
  const fb = arm && isExtendable(arm) ? arm.caps.feedback : undefined;
  if (arm && (fb === "pot" || fb === "hall")) {
    const hallPins = arm.caps.pins ?? 0;
    // A pot without an ADC still works open-loop (the kit falls back to timing), so it only warns.
    const hasAdc = hasAdcPart(parts);
    const ok = fb === "pot" ? true : hallPins > 0;
    add(
      "arm-feedback",
      ok,
      fb === "pot"
        ? hasAdc
          ? `The ${arm.name} position sensor is read by the ADC.`
          : `Warning: without an ADS1115 the ${arm.name} lift runs on timing and may stop a few mm off. Add adc-ads1115 for closed-loop control.`
        : ok
          ? `The ${arm.name} hall sensor uses ${hallPins} GPIO pin${hallPins === 1 ? "" : "s"} to count its travel.`
          : `The ${arm.name} has a hall position sensor but no GPIO pins are set aside for it.`,
    );
  }

  /* 4. Pin budget + pin map */
  const pinMap: Derived["pinMap"] = [];
  const hasI2c = parts.some((p) => p.caps.interface === "i2c");
  // Without I2C parts, BCM 2/3 are free for plain GPIO too.
  const gpioOrder = hasI2c ? GPIO_ORDER : [...GPIO_ORDER, 2, 3];
  const gpioAvailable = Math.min(controller?.caps.pins ?? PI_GPIO_PINS, gpioOrder.length);
  let gpioUsed = 0;
  let pwmChannel = 0;
  let motorChannel = 0;
  const motorChannelName = () => `driver channel ${String.fromCharCode(65 + motorChannel++)}`;
  for (const p of parts) {
    if (p.category === "controller") continue;
    const pins: string[] = [];
    if (p.category === "chassis") {
      pins.push(motorChannelName() + " (left)", motorChannelName() + " (right)");
    } else if (p.caps.interface === "i2c") {
      pins.push("GPIO2 (SDA)", "GPIO3 (SCL)");
    } else if (p.caps.interface === "csi") {
      pins.push("CSI camera port");
    } else if (p.caps.interface === "usb") {
      pins.push("USB");
    } else if (p.caps.interface === "pwm") {
      const n = servoCount(p);
      for (let i = 0; i < n; i++) pins.push(`PCA9685 ch${pwmChannel++}`);
    } else if (needsMotorChannel(p)) {
      pins.push(motorChannelName());
    }
    const want = p.caps.pins ?? 0;
    // Hall feedback pins on a linear arm are labelled so wiring.md shows which wire goes where.
    const roles = isExtendable(p) && p.caps.feedback === "hall" ? HALL_PIN_ROLES : [];
    for (let i = 0; i < want; i++) {
      const bcm = gpioOrder[gpioUsed++];
      pins.push(bcm === undefined ? "NO PIN LEFT" : roles[i] ? `GPIO${bcm} = ${roles[i]}` : `GPIO${bcm}`);
    }
    if (pins.length) pinMap.push({ partId: p.id, pins });
  }
  add(
    "pin-budget",
    gpioUsed <= gpioAvailable,
    gpioUsed <= gpioAvailable
      ? `Uses ${gpioUsed} of ${gpioAvailable} free GPIO pins.`
      : `Needs ${gpioUsed} GPIO pins but the Pi has only ${gpioAvailable} free. Use I2C parts (motor HAT, servo board) to save pins.`,
  );

  /* 5. PWM parts need a servo board */
  const pwmParts = parts.filter((p) => p.caps.interface === "pwm");
  const hasServoBoard = parts.some(isServoBoard);
  if (pwmParts.length) {
    const boardChannels = 16 * parts.filter(isServoBoard).length;
    add(
      "pwm-board",
      hasServoBoard && pwmChannel <= boardChannels,
      !hasServoBoard
        ? `${pwmParts.map((p) => p.name).join(", ")} use servos and need a PCA9685 servo driver board; the Pi cannot drive servos reliably itself.`
        : pwmChannel > boardChannels
          ? `Needs ${pwmChannel} servo channels but the servo board has ${boardChannels}. Add another PCA9685 or use fewer servos.`
          : `Servo board drives ${pwmChannel} of ${boardChannels} servo channels.`,
    );
  }

  /* 6. Power: 5V supply for the Pi */
  const fiveVoltSources = parts.filter((p) => p.category === "power" && p.caps.outputV === 5);
  // A buck regulator needs headroom above 5V; 6V packs sag below it under motor load.
  const highVoltBattery = batteries.some((b) => (b.caps.outputV ?? 0) >= MIN_REGULATOR_INPUT_V);
  const usbPacks = fiveVoltSources.filter(isBattery);
  const regulators = fiveVoltSources.filter(isRegulator);
  const piNeedA = controller ? PI_SUPPLY_A[controller.id] ?? 3 : 0;
  const best5vA = Math.max(
    0,
    ...usbPacks.map((p) => p.caps.maxCurrentA ?? 0),
    ...(highVoltBattery ? regulators.map((p) => p.caps.maxCurrentA ?? 0) : []),
  );
  let supplyMsg: string;
  if (!controller) supplyMsg = "No Raspberry Pi to power.";
  else if (best5vA === 0)
    supplyMsg = regulators.length
      ? `The 5V regulator needs a battery of ${MIN_REGULATOR_INPUT_V}V or more to feed it. A 6V pack drops too low when the motors run.`
      : `The Pi needs a 5V supply: add a USB battery pack or a 5V regulator fed from a ${MIN_REGULATOR_INPUT_V}V or higher battery.`;
  else if (best5vA < piNeedA)
    supplyMsg = `The Pi's 5V supply gives only ${best5vA}A but the ${controller.name} needs ${piNeedA}A. Use a 5V step-down regulator rated ${piNeedA}A or more.`;
  else supplyMsg = `The Pi gets ${best5vA}A at 5V (needs ${piNeedA}A).`;
  add("power-supply", !!controller && best5vA >= piNeedA, supplyMsg);

  /* 7. Battery runtime + current */
  const drawW = parts.reduce((s, p) => s + (p.caps.drawW ?? 0), 0);
  const wh = batteries.reduce((s, p) => s + (p.caps.batteryWh ?? 0), 0);
  const runtimeMin = drawW > 0 ? (wh * BATTERY_USABLE * 60) / drawW : Infinity;
  const maxA = batteries.reduce((s, p) => s + (p.caps.maxCurrentA ?? 0), 0);
  const volts = Math.max(5, ...batteries.map((b) => b.caps.outputV ?? 0));
  const avgA = drawW / volts;
  const batteryOk = batteries.length > 0 && runtimeMin >= MIN_RUNTIME_MIN && avgA <= maxA;
  add(
    "battery",
    batteryOk,
    batteries.length === 0
      ? "The robot has no battery. Add a battery pack."
      : runtimeMin < MIN_RUNTIME_MIN
      ? `Batteries hold ${round1(wh)} Wh but the robot draws about ${round1(drawW)} W, so it runs only ${Math.floor(runtimeMin)} minutes (needs ${MIN_RUNTIME_MIN}). Pick a bigger battery.`
      : avgA > maxA
        ? `The robot pulls about ${round1(avgA)}A but the batteries supply at most ${round1(maxA)}A. Pick a battery with a higher current rating.`
        : `About ${Math.floor(runtimeMin)} minutes of runtime (${round1(wh)} Wh at ${round1(drawW)} W).`,
  );

  /* 8. Payload: chassis carries everything on it; arm carries the object */
  const carriedG = totalMassG - (chassis?.massG ?? 0);
  const chassisCap = chassis?.caps.maxPayloadG ?? 0;
  add(
    "payload",
    !!chassis && carriedG <= chassisCap,
    !chassis
      ? "No chassis to carry the parts."
      : carriedG <= chassisCap
        ? `Carries ${carriedG} g of a ${chassisCap} g limit.`
        : `Parts${waterMassG ? (req ? " and the load" : " and water") : ""} weigh ${carriedG} g but the ${chassis.name} carries at most ${chassisCap} g. Use a bigger chassis or lighter parts.`,
  );
  if (req) {
    checks.push(...requirementChecks(r, req, { footprintW: footprint.w, runtimeMin }));
  } else {
    if (pickupTargets.length) {
      const gripper = parts.find(isGripper);
      const liftG = OBJECT_MASS_G + (gripper?.massG ?? 0);
      const armCap = arm?.caps.armPayloadG ?? 0;
      add(
        "arm-payload",
        !!arm && armCap >= liftG,
        !arm
          ? "Picking things up needs an arm."
          : armCap >= liftG
            ? `The arm lifts ${armCap} g; the object and gripper weigh about ${liftG} g.`
            : `The ${arm.name} lifts only ${armCap} g but the object plus gripper weigh about ${liftG} g. Use a stronger arm.`,
      );
    }

    /* 9. Tools for each action */
    const toolProblems: string[] = [];
    if (waterTargets.length && !parts.some(isPump)) toolProblems.push("watering needs a pump");
    if (waterTargets.length && !parts.some(isTank)) toolProblems.push("watering needs a water tank");
    if (pickupTargets.length && !parts.some(isGripper)) toolProblems.push("picking up needs a gripper");
    if (targets.some((t) => t.action === "photograph") && !parts.some(isCamera)) toolProblems.push("taking photos needs a camera");
    if (targets.some((t) => t.action === "touch") && !arm) toolProblems.push("touching things needs an arm");
    add(
      "tools",
      toolProblems.length === 0,
      toolProblems.length === 0 ? "Has the tools every action needs." : `Missing tools: ${toolProblems.join("; ")}.`,
    );

    /* 10. Reach: height and horizontal distance for every contact target */
    const top = toolTopMm(r);
    const reachH = horizontalReachMm(r);
    const reachFails: string[] = [];
    for (const t of targets) {
      if (!CONTACT_ACTIONS.has(t.action)) continue;
      if (t.heightMm > top) reachFails.push(`${t.label} is ${t.heightMm} mm high but the tool tops out at ${top} mm`);
      const dist = approachDistanceMm(t, room);
      if (dist > reachH) reachFails.push(`${t.label} is ${Math.round(dist)} mm in from the edge but the arm reaches only ${reachH - TOOL_ALLOWANCE_MM} mm (plus ${TOOL_ALLOWANCE_MM} mm tool)`);
    }
    add(
      "reach",
      reachFails.length === 0,
      reachFails.length === 0
        ? `The tool reaches up to ${top} mm and ${reachH} mm out, enough for every target.`
        : `${reachFails.join("; ")}. A taller or extendable arm would fix this.`,
    );

    /* 11. Tank */
    if (waterTargets.length) {
      add(
        "tank",
        tankMl >= waterMl,
        tankMl >= waterMl
          ? `Tank holds ${tankMl} ml; ${waterTargets.length} plants need ${waterMl} ml.`
          : tankMl === 0
            ? `${waterTargets.length} plants need ${waterMl} ml of water but there is no tank. Add a water tank.`
            : `${waterTargets.length} plants need ${waterMl} ml but the tank holds ${tankMl} ml. Use a bigger tank.`,
      );
    }

    /* 12. Doorway */
    if (room.doorways.length) {
      const need = footprint.w + 2 * DOOR_CLEARANCE_MM;
      const widest = Math.max(...room.doorways.map((d) => d.widthMm));
      const narrowest = Math.min(...room.doorways.map((d) => d.widthMm));
      add(
        "doorway",
        need <= widest,
        need > widest
          ? `The robot is ${footprint.w} mm wide and needs ${need} mm to pass, but the widest doorway is ${widest} mm. Use a narrower chassis.`
          : need > narrowest
            ? `The robot is ${footprint.w} mm wide: it fits the ${widest} mm doorway but not the ${narrowest} mm one, so it must take the long way (the simulation checks the actual path).`
            : `The robot is ${footprint.w} mm wide and fits every doorway.`,
      );
    }

    /* 13. Routine */
    const known = new Set(room.targets.map((t) => t.id));
    const badSteps = design.routine.filter((s) => s.target && !known.has(s.target));
    add(
      "routine",
      badSteps.length === 0,
      badSteps.length === 0
        ? `Routine has ${design.routine.length} steps.`
        : `Routine names unknown targets: ${badSteps.map((s) => s.target).join(", ")}. Use only room target ids.`,
    );
  }

  /* 14. Budget */
  add(
    "budget",
    totalUsd <= design.budgetUsd,
    totalUsd <= design.budgetUsd
      ? `Costs $${totalUsd.toFixed(2)} of a $${design.budgetUsd} budget.`
      : `Costs $${totalUsd.toFixed(2)}, over the $${design.budgetUsd} budget by $${(totalUsd - design.budgetUsd).toFixed(2)}.`,
  );

  return { totalUsd, totalMassG, footprint, checks, pinMap };
}

/** Failed checks as one plain-English block, for the repair prompt. */
export function failureText(derived: Derived): string {
  return derived.checks
    .filter((c) => !c.ok)
    .map((c) => `- [${c.id}] ${c.message}`)
    .join("\n");
}

/** Servo count for PWM parts (caps.servoCount, else a guess from the name), so the pin map names real channels. */
export function servoCount(p: Part): number {
  if (p.caps.servoCount !== undefined) return p.caps.servoCount;
  if (p.category === "arm") return /6-?dof/i.test(p.id + p.name) ? 6 : /4-?dof|mearm/i.test(p.id + p.name) ? 4 : 2;
  if (/pan-tilt|pantilt/i.test(p.id + p.name)) return 2;
  return 1;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

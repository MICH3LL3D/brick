// wiring.md: pin table from Derived.pinMap, a text power diagram, and per-part notes.
import type { Design, Part } from "../contracts";
import type { Derived } from "../data";
import { isBattery, isRegulator, resolveParts } from "../derive";
import { DRIVER_PIN_ROLES, sensorPinRoles } from "./pi";

/** "GPIO17" -> "GPIO17 = AIN1" using the part's pin roles, so nobody swaps TRIG and ECHO. */
export function labelPins(part: Part | undefined, pins: string[]): string[] {
  if (!part) return pins;
  const roles =
    part.category === "motor_driver" ? DRIVER_PIN_ROLES[part.id] :
    part.category === "sensor" && part.caps.interface === "gpio" ? sensorPinRoles(part) : undefined;
  if (!roles) return pins;
  let i = 0;
  return pins.map((p) => (/^GPIO\d+$/.test(p) && roles[i] ? `${p} = ${roles[i++]}` : p));
}

export function wiringMd(design: Design, derived: Derived, catalog: Part[]): string {
  const r = resolveParts(design, catalog);
  const name = (id: string) => catalog.find((p) => p.id === id)?.name ?? id;
  const batteries = r.parts.filter(isBattery);
  const regulator = r.parts.find(isRegulator);
  const usbPack = batteries.find((b) => b.caps.outputV === 5);
  const mainBattery = batteries.find((b) => b !== usbPack) ?? batteries[0];
  const drivers = r.parts.filter((p) => p.category === "motor_driver");
  const servoBoard = r.parts.find((p) => /pca9685/i.test(p.id));

  const pinRows = derived.pinMap
    .map((m) => `| ${name(m.partId)} | \`${m.partId}\` | ${labelPins(catalog.find((p) => p.id === m.partId), m.pins).join(", ")} |`)
    .join("\n");

  const power: string[] = [];
  if (usbPack) power.push(`[${usbPack.name}] --USB-C--> [Raspberry Pi]`);
  if (mainBattery && mainBattery !== usbPack) {
    if (regulator && !usbPack) power.push(`[${mainBattery.name}] --+--> [${regulator.name}] --5V/GND pins 2,6--> [Raspberry Pi]`);
    else power.push(`[${mainBattery.name}] --+`);
    for (const d of drivers) power.push(`                     +--> [${d.name}] motor supply (VM / VIN)`);
    if (servoBoard) power.push(`                     +--> (5-6V step-down) --> [${servoBoard.name}] V+ servo rail`);
  }
  if (!usbPack && !(regulator && mainBattery && (mainBattery.caps.outputV ?? 0) > 5.5)) {
    power.push("", "WARNING: this design has no working 5V supply for the Raspberry Pi. Add a 5V regulator fed from a 6V+ battery.");
  }
  power.push("", "All grounds (battery -, regulator GND, driver GND, servo board GND, Pi GND) must be connected together.");

  const notes = r.parts
    .filter((p, i, all) => p.notes && all.findIndex((q) => q.id === p.id) === i)
    .map((p) => `- **${p.name}** (\`${p.id}\`): ${p.notes}`)
    .join("\n");

  return `# Wiring

> This wiring has not been tested on hardware. Check every connection against the part datasheets
> before powering on, and test with the wheels off the ground first.

## Pin map (BCM numbering)

| Part | Id | Connection |
|---|---|---|
${pinRows || "| (none) | | |"}

- "driver channel A/B/..." are motor outputs on the motor driver(s), in the order the drivers are listed.
- "PCA9685 chN" are servo channels on the servo board.
- I2C parts share GPIO2 (SDA) and GPIO3 (SCL). Enable I2C with \`sudo raspi-config\`.

## Power

\`\`\`
${power.join("\n")}
\`\`\`

- Raspberry Pi GPIO is 3.3V logic and is NOT 5V tolerant.
- Never power motors or servos from the Pi's 5V pin. They get their own supply.

## Part notes

${notes}
`;
}

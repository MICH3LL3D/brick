// Build kit zip: buy list, wiring, Pi code, self-test, README and printable manual.
import "server-only";
import JSZip from "jszip";
import type { Design, Part } from "../contracts";
import type { Room, Task } from "../data";
import { deriveAndCheck } from "../derive";
import { simulate } from "../sim-stub"; // switch to "../sim" when A's sim.ts lands
import { buyListCsv } from "./buylist";
import { pyCompileErrors } from "./compile";
import { manualHtml, manualSteps } from "./manual";
import { piFiles, type KitFile } from "./pi";
import { wiringMd } from "./wiring";

/** Checks the generated code depends on. If any fails, the pin or channel mapping is not real. */
const BLOCKING_CHECKS = ["part-ids", "structure", "motor-channels", "motor-current", "pin-budget", "pwm-board"];

export class KitCheckError extends Error {
  constructor(public errors: string[]) {
    super(`The design fails checks the kit depends on:\n${errors.join("\n")}`);
  }
}

export class KitCompileError extends Error {
  constructor(public errors: string[]) {
    super(`Generated code failed to compile:\n${errors.join("\n")}`);
  }
}

function readme(design: Design, task: Task, failed: string[]): string {
  return `# Robot build kit

**This code has not been tested on hardware. Test with wheels off the ground first.**

Task: ${task.prompt}

${design.summary}

## What's inside

- \`buy-list.csv\`: every part, vendor link, price and whether a human has verified it. Prices are from vendor pages at scrape time.
- \`wiring.md\`: pin map, power diagram and wiring notes for each part.
- \`manual.html\`: printable assembly manual. Open it in a browser and print.
- \`pi/\`: Python for the Raspberry Pi (Pi 4B or Pi 5), using gpiozero.

## Set up the Pi

1. Flash Raspberry Pi OS (64-bit) with Raspberry Pi Imager. Enable SSH.
2. Enable I2C: \`sudo raspi-config\` then Interface Options, I2C.
3. Copy the \`pi/\` folder to the Pi, then:
   \`\`\`
   cd pi
   python3 -m venv --system-site-packages .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   \`\`\`
   If the robot has a camera: \`sudo apt install python3-picamera2\`.

## Run

1. Lift the robot so the wheels are off the ground.
2. \`python3 selftest.py\` tests each part alone at low speed. Press Enter before each part.
3. Put the robot at the home spot facing +x, then \`python3 main.py\`. Keep a hand on the motor battery plug.

Driving uses dead reckoning (timed moves), so it drifts. Calibrate \`MAX_SPEED_MPS\` and \`WHEEL_BASE_MM\` in \`config.py\` first.
${failed.length ? `\n## Checks that failed for this design\n\n${failed.map((f) => `- ${f}`).join("\n")}\n` : ""}
## Limitations

- Untested on hardware. Servo angles and actuator speeds are starting guesses.
- The room map is a sample apartment. Room scanning (LiDAR iPhone import) is future work.
`;
}

export async function buildKit(design: Design, task: Task, room: Room, catalog: Part[], useGemini: boolean): Promise<Buffer> {
  const derived = deriveAndCheck(design, task, room, catalog);
  const blocking = derived.checks.filter((c) => !c.ok && BLOCKING_CHECKS.includes(c.id)).map((c) => c.message);
  // The generated code drives one PCA9685 at 0x40, so more than 16 servo channels cannot be wired.
  const servoChannels = derived.pinMap.flatMap((m) => m.pins).filter((p) => p.startsWith("PCA9685 ch")).length;
  if (servoChannels > 16) blocking.push(`The kit supports one servo board (16 channels); this design needs ${servoChannels}.`);
  if (blocking.length) throw new KitCheckError(blocking);
  const sim = simulate(design, task, room, catalog);
  const code = piFiles(design, task, derived, sim, room, catalog);

  const errors = await pyCompileErrors(code);
  if (errors.length) throw new KitCompileError(errors);

  const { steps } = await manualSteps(design, task, catalog, useGemini);
  const failed = derived.checks.filter((c) => !c.ok).map((c) => c.message);
  const files: KitFile[] = [
    { path: "README.md", content: readme(design, task, failed) },
    { path: "buy-list.csv", content: buyListCsv(design, catalog) },
    { path: "wiring.md", content: wiringMd(design, derived, catalog) },
    { path: "manual.html", content: manualHtml(design, task, catalog, steps) },
    ...code,
    { path: "pi/README.md", content: readme(design, task, failed) },
  ];

  const zip = new JSZip();
  const folder = zip.folder("robot-kit")!;
  for (const f of files) folder.file(f.path, f.content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

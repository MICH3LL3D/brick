// manual.html: printable assembly manual. Step text from ONE Gemini call (CHEAP model),
// validated with zod; template steps if the call fails or returns junk.
import "server-only";
import { z } from "zod";
import type { Design, Part } from "../contracts";
import type { Task } from "../data";
import { isExtendable, resolveParts } from "../derive";
import { generateWithFallback, parseJsonText } from "../gemini";
import { MODELS } from "../models";
import { buyRows } from "./buylist";

const Steps = z.array(z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(600) })).min(4).max(14);
export type Step = z.infer<typeof Steps>[number];

export function templateSteps(design: Design, catalog: Part[]): Step[] {
  const r = resolveParts(design, catalog);
  const has = (cat: Part["category"]) => r.parts.some((p) => p.category === cat);
  const steps: Step[] = [
    { title: "Check the parts", body: "Lay out every part from the checklist. Charge the batteries. Keep the batteries unplugged until the last step." },
    { title: "Build the chassis", body: `Assemble the ${r.chassis?.name ?? "chassis"} following its own instructions. Fit the motors and wheels, and route the motor wires to the top deck.` },
    { title: "Mount the Raspberry Pi", body: "Fix the Pi to the deck with standoffs so no metal touches its underside. Flash Raspberry Pi OS to the SD card first and enable I2C and SSH." },
  ];
  if (has("motor_driver")) steps.push({ title: "Wire the motor driver", body: "Connect the driver's logic pins to the Pi exactly as wiring.md lists. Connect the motor wires to the driver outputs. Do not connect the motor battery yet." });
  if (r.arm) steps.push({
    title: isExtendable(r.arm) ? "Mount the lift mast" : "Build and mount the arm",
    body: isExtendable(r.arm)
      ? "Bolt the linear actuator upright to the deck with a sturdy bracket near the centre of the robot. Wire its motor to the driver channel in wiring.md and its feedback pot to the ADC (3.3V, GND, signal)."
      : "Assemble the arm kit, centre every servo before fitting the horns, then bolt the arm to the front of the deck. Plug the servos into the PCA9685 channels in wiring.md.",
  });
  if (has("tool")) steps.push({ title: "Fit the tool", body: "Attach the tool (pump nozzle, gripper or camera mount) to the arm tip or deck. For water, keep the tank and tubing away from the electronics and add a drip loop." });
  if (has("sensor")) steps.push({ title: "Add the sensors", body: "Mount the camera and distance sensors facing forward. Use 3.3V power for sensors whose outputs go to Pi pins." });
  steps.push(
    { title: "Wire the power", body: "Follow the power diagram in wiring.md: battery to regulator to the Pi's 5V pins, and the motor supply straight to the driver. Join all grounds. Double-check polarity before plugging anything in." },
    { title: "Install the software", body: "Copy the pi/ folder to the Pi, then run: pip install -r requirements.txt. Run python3 selftest.py with the wheels off the ground." },
    { title: "First run", body: "Put the robot at the home spot facing the +x direction. Run python3 main.py and stay ready to unplug the motor battery." },
  );
  return steps;
}

async function geminiSteps(design: Design, task: Task, catalog: Part[]): Promise<Step[]> {
  const parts = buyRows(design, catalog).map((r) => `- ${r.qty} x ${r.part.name} (${r.part.category}). Notes: ${r.part.notes}`).join("\n");
  const prompt = `Write assembly steps for a small wheeled Raspberry Pi robot built for: ${JSON.stringify(task.prompt)}.
Parts:
${parts}
Rules: 6-12 steps, in build order, plain English for beginners, each body 1-3 sentences.
Mention wiring.md for pin numbers instead of inventing pins. Keep motor and logic power separate.
Return ONLY a JSON array of {"title": string, "body": string}.`;
  const res = await generateWithFallback(
    { model: MODELS.CHEAP, contents: prompt, config: { responseMimeType: "application/json", temperature: 0.3 } },
    { primaryTimeoutMs: 12_000, fallbackTimeoutMs: 15_000 },
  );
  return Steps.parse(parseJsonText(res.text));
}

export async function manualSteps(design: Design, task: Task, catalog: Part[], useGemini: boolean): Promise<{ steps: Step[]; source: "gemini" | "template" }> {
  if (useGemini) {
    try {
      return { steps: await geminiSteps(design, task, catalog), source: "gemini" };
    } catch (e) {
      console.warn("[kit] manual steps fell back to template:", (e as Error).message.slice(0, 120));
    }
  }
  return { steps: templateSteps(design, catalog), source: "template" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function manualHtml(design: Design, task: Task, catalog: Part[], steps: Step[]): string {
  const rows = buyRows(design, catalog);
  const total = rows.reduce((s, r) => s + r.lineUsd, 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assembly manual</title>
<style>
  :root { --ink: #1f2a24; --muted: #5d6b63; --line: #d9ded8; --accent: #6f8f72; --paper: #fbf8f3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  .sub { color: var(--muted); margin: 0 0 16px; }
  .warn { border: 2px solid #b5523b; border-radius: 8px; padding: 12px 14px; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 13px; color: var(--muted); font-weight: 600; }
  .box { width: 16px; height: 16px; border: 1.5px solid var(--ink); border-radius: 3px; display: inline-block; }
  ol.steps { list-style: none; counter-reset: s; padding: 0; }
  ol.steps li { counter-increment: s; position: relative; padding: 0 0 18px 48px; break-inside: avoid; }
  ol.steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 32px; height: 32px; border-radius: 50%;
    background: var(--accent); color: #fbf8f3; display: grid; place-items: center; font-weight: 700; }
  ol.steps h3 { margin: 4px 0 4px; font-size: 16px; }
  ul.safety li { margin-bottom: 6px; }
  @media print { body { background: #fff; } main { padding: 0; } a { color: inherit; text-decoration: none; } .warn { border-color: #000; } }
</style>
</head>
<body>
<main>
  <h1>Assembly manual</h1>
  <p class="sub">${esc(design.summary)}<br>Task: ${esc(task.prompt)}</p>
  <p class="warn"><strong>This design and its code have not been tested on hardware.</strong> Check every connection against the datasheets, and test with the wheels off the ground first.</p>

  <h2>Parts checklist</h2>
  <table>
    <thead><tr><th></th><th>Part</th><th>Qty</th><th>Vendor</th><th>Price</th></tr></thead>
    <tbody>
${rows.map((r) => `      <tr><td><span class="box"></span></td><td>${esc(r.part.name)}${r.part.verified ? "" : " <em>(not yet verified)</em>"}</td><td>${r.qty}</td><td>${esc(r.part.vendor)}</td><td>$${r.lineUsd.toFixed(2)}</td></tr>`).join("\n")}
      <tr><td></td><td><strong>Total</strong></td><td></td><td></td><td><strong>$${total.toFixed(2)}</strong></td></tr>
    </tbody>
  </table>
  <p class="sub">Prices are from vendor pages at scrape time and may have changed.</p>

  <h2>Safety</h2>
  <ul class="safety">
    <li>Disconnect all batteries while wiring.</li>
    <li>The Raspberry Pi's pins are 3.3V only. 5V on a GPIO pin can destroy the Pi.</li>
    <li>Motors and servos get their own power supply, never the Pi's 5V pin. Connect all grounds together.</li>
    <li>Keep water away from the electronics. Unplug the motor battery before filling the tank.</li>
    <li>Charge batteries with the right charger and never leave them charging unattended.</li>
  </ul>

  <h2>Steps</h2>
  <ol class="steps">
${steps.map((s) => `    <li><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join("\n")}
  </ol>
</main>
</body>
</html>
`;
}

// SHARED CONTRACTS. Frozen by 10:45. Do not change without telling every agent.
// All units: millimetres, grams, US dollars, volts, amps, seconds unless the field name says otherwise.
import { z } from "zod";

/* ---------- Parts catalog ---------- */

export const PartCategory = z.enum([
  "chassis",      // wheeled base (2WD or 4WD, small/medium/large)
  "controller",   // Raspberry Pi board
  "motor_driver",
  "arm",          // servo arm or extendable (telescoping / linear actuator) arm
  "tool",         // gripper, pump+nozzle, camera mount
  "sensor",       // camera, ultrasonic, etc.
  "power",        // battery pack, regulators
  "misc",         // tank, wiring, servo driver board, ADC
]);

export const Part = z.object({
  id: z.string(),                         // stable, e.g. "chassis-4wd-m"
  category: PartCategory,
  name: z.string(),
  priceUsd: z.number(),
  vendor: z.string(),
  url: z.string().url(),
  verified: z.boolean(),                  // true once a human spot-checked it
  dims: z.object({ l: z.number(), w: z.number(), h: z.number() }),
  massG: z.number(),
  // Capability fields, only the ones that apply to the category:
  caps: z.object({
    wheels: z.number().int().optional(),          // chassis
    maxPayloadG: z.number().optional(),           // chassis
    speedMps: z.number().optional(),              // chassis, no-load
    wheelDiameterMm: z.number().optional(),       // chassis
    reachMm: z.object({ min: z.number(), max: z.number() }).optional(), // arm: horizontal reach from mount. Extendable arms have min < max.
    liftMaxMm: z.number().optional(),             // arm: max height of tool above mount
    armPayloadG: z.number().optional(),           // arm
    tankMl: z.number().optional(),                // tool/misc: water tank
    pumpMlPerS: z.number().optional(),            // tool
    gripMaxMm: z.number().optional(),             // tool: gripper opening
    batteryWh: z.number().optional(),             // power
    outputV: z.number().optional(),               // power
    maxCurrentA: z.number().optional(),           // power
    drawW: z.number().optional(),                 // average draw, any consumer
    pins: z.number().int().optional(),            // pins this part needs on the Pi (0 if via a board)
    interface: z.enum(["gpio", "pwm", "i2c", "usb", "csi", "none"]).optional(),
  }),
  mounts: z.array(z.string()).default([]),        // slot names it can occupy: "deck", "front", "tool_mount", ...
  notes: z.string().default(""),                  // wiring gotchas, 3.3V logic, separate motor supply, etc.
});
export type Part = z.infer<typeof Part>;

/* ---------- Design (what Gemini returns, constrained to catalog ids) ---------- */

export const RoutineStep = z.object({
  op: z.enum(["goto", "extend_arm", "retract_arm", "grip", "release", "pump_on", "pump_off", "wait", "photograph", "return_home"]),
  target: z.string().optional(),     // target id from the task
  value: z.number().optional(),      // mm for extend, seconds for wait/pump
});

export const Design = z.object({
  summary: z.string(),                                  // one friendly sentence
  partIds: z.array(z.string()),                         // every part, by catalog id (no invented parts)
  reasons: z.record(z.string(), z.string()),            // partId -> why it was chosen
  routine: z.array(RoutineStep),
  budgetUsd: z.number(),
});
export type Design = z.infer<typeof Design>;

/* ---------- Task + room ---------- */

export const Target = z.object({
  id: z.string(),
  label: z.string(),                                    // "fern on the shelf"
  x: z.number(), y: z.number(),                         // floor position in mm, room frame
  heightMm: z.number(),                                 // height of the thing to act on
  action: z.enum(["water", "pickup", "drop", "photograph", "touch"]),
});

export const Room = z.object({
  name: z.string(),
  widthMm: z.number(), depthMm: z.number(),
  obstacles: z.array(z.object({ id: z.string(), label: z.string(), x: z.number(), y: z.number(), w: z.number(), d: z.number(), h: z.number() })),
  doorways: z.array(z.object({ x: z.number(), y: z.number(), widthMm: z.number() })),
  home: z.object({ x: z.number(), y: z.number() }),
  targets: z.array(Target),                             // candidates; a Task picks a subset
});

/** What the task physically needs, estimated by Gemini from the prompt alone (no room). All 0/false = not needed. */
export const Requirements = z.object({
  feasible: z.boolean(),                                // can a small wheeled robot do this at all?
  notes: z.string().max(600),                           // honest limitations, plain English
  actions: z.array(z.string().max(60)).max(12),         // short verbs: "pick up", "carry", "water", "photograph"...
  reachHeightMm: z.number().min(0),                     // highest point the tool must reach, above the floor
  reachOutMm: z.number().min(0),                        // how far past the robot's front the tool must reach
  gripWidthMm: z.number().min(0),                       // object width the gripper must open to
  liftMassG: z.number().min(0),                         // heaviest object the arm must lift
  carryMassG: z.number().min(0),                        // extra load riding on the deck
  liquidMl: z.number().min(0),                          // liquid dispensed per mission
  needsCamera: z.boolean(),
  needsDistanceSensor: z.boolean(),
  maxWidthMm: z.number().min(0),                        // robot must be no wider than this (0 = no limit)
  runtimeMin: z.number().min(0),                        // minutes of runtime per mission
});

export const Task = z.object({
  prompt: z.string(),                                   // the user's words
  targetIds: z.array(z.string()),                       // chosen by Gemini from room.targets (empty for room-free designs)
  requirements: Requirements.optional(),                // room-free designs are checked against these instead of targets
});

/* ---------- Checks + simulation ---------- */

export const Check = z.object({
  id: z.string(),                                       // "pin-budget", "reach", "payload", "battery", "doorway", "power-supply"
  ok: z.boolean(),
  message: z.string(),                                  // plain English, also fed back to Gemini on failure
});

export const SimResult = z.object({
  success: z.boolean(),
  checks: z.array(Check),
  path: z.array(z.object({ x: z.number(), y: z.number(), t: z.number() })),
  events: z.array(z.object({ t: z.number(), targetId: z.string(), op: z.string(), ok: z.boolean(), note: z.string() })),
  batteryUsedPct: z.number(),
  durationS: z.number(),
});

export const Derived = z.object({
  totalUsd: z.number(),
  totalMassG: z.number(),
  footprint: z.object({ l: z.number(), w: z.number() }),
  checks: z.array(Check),
  pinMap: z.array(z.object({ partId: z.string(), pins: z.array(z.string()) })),
});

/* ---------- Chat ---------- */

export const ChatAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_budget"), budgetUsd: z.number() }),
  z.object({ type: z.literal("swap_part"), removeId: z.string(), addId: z.string() }),
  z.object({ type: z.literal("regenerate"), instruction: z.string() }),
]);

/* ---------- API routes (all JSON) ---------- */
// POST /api/generate  { prompt, budgetUsd, roomId? }   -> { task, design, derived, sim }
// POST /api/rebudget  { design, budgetUsd }            -> { design, derived, sim }   (deterministic, no Gemini)
// POST /api/chat      { messages, design, task }       -> { reply, actions: ChatAction[] }
// POST /api/kit       { design, task }                 -> application/zip
// GET  /api/catalog                                    -> Part[]
// GET  /api/room                                       -> Room

// Run: npm test   (node:test via tsx)
// Checks for heavy parts (high-current actuators, feedback, servo counts, grippers, 6V packs).
// Uses small inline fake parts so it does not depend on which parts the catalog has.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design, Part } from "./contracts";
import { loadCatalog, loadRoom, type Task } from "./data";
import { deriveAndCheck, failureText } from "./derive";
import { simulate } from "./sim-stub";
import { pyCompileErrors } from "./kit/compile";
import { buildKit, KitCheckError } from "./kit/index";
import { piFiles } from "./kit/pi";

const catalog = loadCatalog();
const room = loadRoom();
const task: Task = { prompt: "test", targetIds: [] };
const base = (id: string) => {
  const p = catalog.find((x) => x.id === id);
  assert.ok(p, `catalog has ${id}`);
  return p;
};
const fake = (from: string, id: string, caps: Partial<Part["caps"]>, extra: Partial<Part> = {}): Part => {
  const p = base(from);
  return { ...p, ...extra, id, caps: { ...p.caps, ...caps } };
};

const BIG_ARM = fake("arm-lact10p", "arm-big-test", { stallA: 5, speedMmS: 9 });
const POT_ARM = fake("arm-lact10p", "arm-pot-test", { feedback: "pot" });
const HALL_ARM = fake("arm-lact10p", "arm-hall-test", { feedback: "hall", pins: 2, stallA: 4, speedMmS: 7.5 });
const SIX_ARM = fake("arm-waveshare-4dof", "arm-six-test", { servoCount: 6 }, { name: "Test arm" });
const SIX_ARM_NAMED = fake("arm-waveshare-4dof", "arm-6dof-test", {}, { name: "Test 6-DOF arm" });
const GRIPPER_2 = fake("tool-gripper", "tool-gripper-test", {});
const PACK_6V = fake("bat-nimh-2200", "bat-6v-test", { outputV: 6 });
const STALL_CHASSIS = fake("chassis-4wd-m", "chassis-stall-test", { stallA: 5.6 });
const fakes = [BIG_ARM, POT_ARM, HALL_ARM, SIX_ARM, SIX_ARM_NAMED, GRIPPER_2, PACK_6V, STALL_CHASSIS];
const all = [...catalog, ...fakes];

const design = (partIds: string[]): Design => ({ summary: "t", partIds, reasons: {}, routine: [], budgetUsd: 5000 });
const derive = (ids: string[]) => deriveAndCheck(design(ids), task, room, all);
const check = (d: ReturnType<typeof derive>, id: string) => d.checks.find((c) => c.id === id);

const CORE = ["chassis-4wd-m", "pi4b-4gb", "bat-nimh-2200", "reg-5v-3a"];

test("a 5 A arm on a TB6612 channel fails motor-current and names the G2 driver", () => {
  const d = derive([...CORE, "md-tb6612", "md-tb6612", BIG_ARM.id]);
  const c = check(d, "motor-current");
  assert.equal(c?.ok, false, failureText(d));
  assert.match(c!.message, new RegExp(BIG_ARM.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(c!.message, /md-g2-24v14/);
  assert.match(c!.message, /5 A/);
});

test("a 5 A arm on a G2 channel passes motor-current", () => {
  const d = derive([...CORE, "md-tb6612", "md-g2-24v14", BIG_ARM.id]);
  assert.equal(check(d, "motor-current")?.ok, true, failureText(d));
});

test("motor-current is skipped when no part lists a stall current", () => {
  const d = derive([...CORE, "md-motor-hat", "arm-lact10p"]);
  assert.equal(check(d, "motor-current"), undefined);
});

test("missing channel for a high-current arm suggests the G2 driver, not the 1.2 A HAT", () => {
  const d = derive([...CORE, "md-tb6612", BIG_ARM.id]);
  const c = check(d, "motor-channels")!;
  assert.equal(c.ok, false);
  assert.match(c.message, /md-g2-24v14/);
  assert.doesNotMatch(c.message, /motor HAT/);
});

test("wheel motors above the driver rating only warn, they do not fail motor-current", () => {
  const ids = [STALL_CHASSIS.id, ...CORE.slice(1), "md-motor-hat"];
  const d = derive(ids);
  const c = check(d, "motor-current")!;
  assert.equal(c.ok, true);
  assert.match(c.message, /wheel motors can briefly pull 5\.6 A/);
  assert.match(c.message, /may cut out/);
});

test("pot-feedback arm without an ADC fails arm-feedback; with one it passes", () => {
  const without = derive([...CORE, "md-motor-hat", POT_ARM.id]);
  const c = check(without, "arm-feedback")!;
  assert.equal(c.ok, false);
  assert.match(c.message, /ADS1115/);
  assert.equal(check(derive([...CORE, "md-motor-hat", POT_ARM.id, "adc-ads1115"]), "arm-feedback")?.ok, true);
});

test("buildKit refuses a pot-feedback arm without an ADC", async () => {
  await assert.rejects(buildKit(design([...CORE, "md-motor-hat", POT_ARM.id]), task, room, all, false), KitCheckError);
});

test("hall-feedback arm: pin map labels the hall pins and the kit counts pulses", async () => {
  const ids = [...CORE, "md-tb6612", "md-g2-24v14", HALL_ARM.id];
  const d = derive(ids);
  assert.equal(check(d, "arm-feedback")?.ok, true, failureText(d));
  assert.equal(check(d, "motor-current")?.ok, true, failureText(d));
  const row = d.pinMap.find((m) => m.partId === HALL_ARM.id)!;
  assert.ok(row.pins.some((p) => /^GPIO\d+ = HALL A$/.test(p)), row.pins.join(", "));
  assert.ok(row.pins.some((p) => /^GPIO\d+ = HALL B$/.test(p)), row.pins.join(", "));

  const dz = design(ids);
  const files = piFiles(dz, task, d, simulate(dz, task, room, all), room, all);
  const config = files.find((f) => f.path === "pi/config.py")!.content;
  assert.match(config, /ARM_FEEDBACK = \{"type": "hall", "pins": \[\d+, \d+\]\}/);
  assert.match(config, /ARM_SPEED_MM_S = 7\.500/);
  assert.match(config, /ARM_PULSES_PER_MM = .*TODO/);
  assert.match(files.find((f) => f.path === "pi/drivers/linear_arm.py")!.content, /when_activated/);
  assert.deepEqual(await pyCompileErrors(files), []);
});

test("arm without speedMmS keeps the 14 mm/s default", () => {
  const ids = [...CORE, "md-motor-hat", "arm-lact10p"];
  const d = derive(ids);
  const dz = design(ids);
  const config = piFiles(dz, task, d, simulate(dz, task, room, all), room, all).find((f) => f.path === "pi/config.py")!.content;
  assert.match(config, /ARM_SPEED_MM_S = 14 /);
});

test("6-servo arm takes 6 PCA9685 channels (from caps.servoCount or a 6-DOF name)", () => {
  for (const arm of [SIX_ARM, SIX_ARM_NAMED]) {
    const d = derive([...CORE, "md-motor-hat", "servo-pca9685", arm.id]);
    const row = d.pinMap.find((m) => m.partId === arm.id)!;
    assert.equal(row.pins.filter((p) => p.startsWith("PCA9685 ch")).length, 6, arm.id);
  }
});

test("two grippers fail structure", () => {
  const d = derive([...CORE, "md-motor-hat", "servo-pca9685", "arm-mearm", "tool-gripper", GRIPPER_2.id]);
  const c = check(d, "structure")!;
  assert.equal(c.ok, false);
  assert.match(c.message, /can carry only one gripper/);
});

test("a 6V pack cannot feed the 5V regulator", () => {
  const d = derive(["chassis-4wd-m", "pi4b-4gb", PACK_6V.id, "reg-5v-3a", "md-motor-hat"]);
  const c = check(d, "power-supply")!;
  assert.equal(c.ok, false);
  assert.match(c.message, /7V/);
  assert.equal(check(derive([...CORE, "md-motor-hat"]), "power-supply")?.ok, true);
});

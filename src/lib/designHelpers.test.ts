import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design } from "./contracts";
import { loadCatalog, loadRoom } from "./data";
import { AUTO_REASON_TAG, checkWithReasons, designGuidance, preRepair, unmetArmNeeds } from "./designHelpers";
import { impossibleNeeds, type RequirementsT } from "./requirements";

const catalog = loadCatalog();
const room = loadRoom();
const NONE: RequirementsT = {
  feasible: true, notes: "", actions: [], reachHeightMm: 0, reachOutMm: 0, gripWidthMm: 0, liftMassG: 0,
  carryMassG: 0, liquidMl: 0, needsCamera: false, needsDistanceSensor: false, maxWidthMm: 0, runtimeMin: 0,
};
const BOOKS: RequirementsT = { ...NONE, reachHeightMm: 1000, reachOutMm: 150, gripWidthMm: 45, liftMassG: 600 };

const withReasons = (partIds: string[], budgetUsd = 500): Design => ({
  summary: "t", partIds, routine: [], budgetUsd, reasons: Object.fromEntries(partIds.map((id) => [id, `why ${id}`])),
});
const run = (d: Design, req: RequirementsT = NONE) => {
  const task = { prompt: "t", targetIds: [], requirements: req };
  const check = (x: Design) => checkWithReasons(x, task, room, catalog);
  const ids = new Set([...impossibleNeeds(req, catalog).map((n) => n.checkId), ...(unmetArmNeeds(req, catalog, d.budgetUsd)?.checkIds ?? [])]);
  return preRepair(d, check(d), catalog, check, { req, impossibleIds: ids });
};
const failed = (r: ReturnType<typeof run>) => r.derived.checks.filter((c) => !c.ok).map((c) => c.id).sort();

const BASE = ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "bat-nimh-2200", "reg-5v-3a"];

test("preRepair: a passing design is left alone", () => {
  const d = withReasons(BASE);
  const r = run(d);
  assert.equal(r.design, d);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(failed(r), []);
});

test("preRepair: linear actuator on a 2-channel driver gets the 4-channel motor HAT", () => {
  const r = run(withReasons(["chassis-4wd-m", "pi4b-4gb", "md-tb6612", "arm-lact4p", "bat-nimh-2200", "reg-5v-3a"]));
  assert.ok(r.design.partIds.includes("md-motor-hat"));
  assert.ok(!r.design.partIds.includes("md-tb6612"));
  assert.ok(r.design.reasons["md-motor-hat"]);
  assert.equal(r.design.reasons["md-tb6612"], undefined);
  assert.ok(!failed(r).includes("motor-channels"));
  assert.match(r.notes.join(" "), /Code swapped md-tb6612 for md-motor-hat because the robot needs 3 motor channels/);
});

test("preRepair: servo arm without a servo board gets servo-pca9685", () => {
  const r = run(withReasons([...BASE, "arm-waveshare-4dof"]));
  assert.ok(r.design.partIds.includes("servo-pca9685"));
  assert.ok(!failed(r).includes("pwm-board"));
  assert.match(r.notes.join(" "), /Code added servo-pca9685 because arm-waveshare-4dof use servos/);
});

test("preRepair: USB pack with no regulator becomes 7.2V pack + reg-5v-3a", () => {
  const r = run(withReasons(["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "bat-usb-10000"]));
  assert.ok(r.design.partIds.includes("reg-5v-3a"));
  assert.ok(r.design.partIds.includes("bat-nimh-2200"));
  assert.ok(!r.design.partIds.includes("bat-usb-10000"));
  assert.ok(!failed(r).includes("power-supply"));
  assert.match(r.notes.join(" "), /reg-5v-3a/);
  assert.match(r.notes.join(" "), /replaced bat-usb-10000 with bat-nimh-2200/);
});

test("preRepair: missing reasons are filled and flagged as generic", () => {
  const d = { ...withReasons(BASE), reasons: { "pi4b-4gb": "brain" } };
  const r = run(d);
  assert.deepEqual(failed(r), []);
  assert.equal(r.design.reasons["pi4b-4gb"], "brain");
  assert.ok(r.design.reasons["md-motor-hat"].endsWith(AUTO_REASON_TAG));
  assert.match(r.notes.join(" "), /Code filled a generic reason for chassis-4wd-m/);
});

test("preRepair: impossible reach swaps a short arm for the closest one within budget", () => {
  const r = run(withReasons(["chassis-4wd-m", "pi4b-4gb", "md-tb6612", "arm-lact4p", "tool-gripper", "servo-pca9685", "bat-nimh-2200", "reg-5v-3a"]), BOOKS);
  assert.ok(r.design.partIds.includes("arm-lact12p"), r.design.partIds.join(","));
  assert.ok(r.design.partIds.includes("md-motor-hat"));
  assert.deepEqual(failed(r), ["reach-height"]);
  assert.match(r.notes.join(" "), /Code swapped arm-lact4p for arm-lact12p/);
});

test("preRepair: closest-arm swap never breaks the budget", () => {
  const r = run(withReasons(["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "arm-lact4p", "tool-gripper", "servo-pca9685", "bat-nimh-2200", "reg-5v-3a"], 380), BOOKS);
  assert.ok(r.design.partIds.includes("arm-lact4p"));
  assert.ok(!failed(r).includes("budget"));
});

test("preRepair: over budget swaps pricey parts for cheaper equivalents that still pass", () => {
  // Shelf at 600 mm: lact4p (467 mm) is too short, so lact10p must stay; pi5 and reg-5v-5a get cheaper.
  const req = { ...NONE, reachHeightMm: 600 };
  const r = run(withReasons(["chassis-4wd-m", "pi5-4gb", "md-motor-hat", "arm-lact10p", "bat-nimh-2200", "reg-5v-5a"], 430), req);
  assert.deepEqual(failed(r), []);
  assert.ok(r.design.partIds.includes("arm-lact10p"));
  assert.ok(r.design.partIds.includes("pi4b-4gb"));
  assert.match(r.notes.join(" "), /Code swapped pi5-4gb for pi4b-4gb because the design was over budget/);
});

test("designGuidance: names qualifying and closest parts, plus the motor HAT", () => {
  const g = designGuidance(BOOKS, catalog, 500);
  assert.match(g, /Catalog limits .*tool top 849 mm/);
  assert.match(g, /No arm meets every arm need/);
  assert.match(g, /Use arm-lact12p on chassis-4wd-m: it gets closest within the budget/);
  assert.match(g, /md-motor-hat \(4 channels\)/);
  assert.match(g, /Grippers opening >= 45 mm: tool-gripper/);
});

test("unmetArmNeeds: null when one affordable arm meets all arm needs", () => {
  assert.equal(unmetArmNeeds({ ...NONE, reachHeightMm: 400, liftMassG: 300 }, catalog, 500), null);
  assert.deepEqual(unmetArmNeeds({ ...NONE, reachHeightMm: 600 }, catalog, 300)?.checkIds, ["reach-height"]);
});

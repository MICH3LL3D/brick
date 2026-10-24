import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design } from "./contracts";
import { loadCatalog, loadRoom } from "./data";
import { deriveAndCheck } from "./derive";
import { impossibleNeeds, type RequirementsT } from "./requirements";

const catalog = loadCatalog();
const room = loadRoom();
const NONE: RequirementsT = {
  feasible: true, notes: "", actions: [], reachHeightMm: 0, reachOutMm: 0, gripWidthMm: 0, liftMassG: 0,
  carryMassG: 0, liquidMl: 0, needsCamera: false, needsDistanceSensor: false, maxWidthMm: 0, runtimeMin: 0,
};
const design = (partIds: string[], budgetUsd = 500): Design => ({ summary: "t", partIds, reasons: {}, routine: [], budgetUsd });
const check = (partIds: string[], req: Partial<RequirementsT>) =>
  deriveAndCheck(design(partIds), { prompt: "t", targetIds: [], requirements: { ...NONE, ...req } }, room, catalog).checks;
const failed = (checks: { id: string; ok: boolean }[]) => checks.filter((c) => !c.ok).map((c) => c.id).sort();

const BASE = ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "bat-nimh-2200", "reg-5v-3a"];
// Books on a ~600 mm shelf: lift 600 mm, grip 40 mm, ~600 g.
const BOOKS = { reachHeightMm: 600, reachOutMm: 100, gripWidthMm: 40, liftMassG: 600 };

test("room-free design ignores room targets and doorways", () => {
  const ids = failed(check(BASE, {}));
  assert.deepEqual(ids, []);
  for (const c of check(BASE, {})) assert.ok(!["reach", "tank", "doorway", "routine", "tools"].includes(c.id), c.id);
});

test("book grabbing: base robot fails reach/grip/arm, lift mast + gripper passes", () => {
  assert.deepEqual(failed(check(BASE, BOOKS)), ["arm-payload", "grip", "reach-height", "reach-out"]);
  const good = [...BASE, "arm-lact10p", "tool-gripper", "servo-pca9685"];
  assert.deepEqual(failed(check(good, BOOKS)), []);
});

test("servo arm is too short and too weak for books on a shelf", () => {
  const ids = failed(check([...BASE, "arm-mearm", "tool-gripper", "servo-pca9685"], BOOKS));
  for (const id of ["reach-height", "arm-payload"]) assert.ok(ids.includes(id), id);
});

test("liquid, camera, sensor and width needs are checked", () => {
  assert.deepEqual(failed(check(BASE, { liquidMl: 300, needsCamera: true, needsDistanceSensor: true, maxWidthMm: 150 })),
    ["camera", "distance-sensor", "liquid", "width"]);
  const ok = ["chassis-2wd-m", "pi4b-4gb", "md-motor-hat", "bat-nimh-2200", "reg-5v-3a", "tool-pump-peristaltic", "tank-500", "cam-pi3", "us-rcwl1601"];
  assert.deepEqual(failed(check(ok, { liquidMl: 300, needsCamera: true, needsDistanceSensor: true, maxWidthMm: 200 })), []);
});

test("carried load counts toward chassis payload", () => {
  assert.ok(failed(check(["chassis-2wd-s", ...BASE.slice(1)], { carryMassG: 2000 })).includes("payload"));
});

test("impossibleNeeds flags needs beyond every catalog part", () => {
  const ids = impossibleNeeds({ ...NONE, reachHeightMm: 1800, gripWidthMm: 300, liftMassG: 10_000 }, catalog).map((n) => n.checkId).sort();
  assert.deepEqual(ids, ["arm-payload", "grip", "reach-height"]);
  assert.deepEqual(impossibleNeeds({ ...NONE, ...BOOKS }, catalog), []);
});

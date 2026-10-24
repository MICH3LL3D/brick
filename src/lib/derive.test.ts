// Run: npm test   (node:test via tsx)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design, Part } from "./contracts";
import { loadCatalog, loadRoom } from "./data";
import { deriveAndCheck, failureText } from "./derive";

const catalog = loadCatalog();
const room = loadRoom();
const waterTask = { prompt: "water my plants", targetIds: ["plant-floor", "plant-table", "plant-shelf"] };

function design(partIds: string[], budgetUsd = 500): Design {
  return {
    summary: "test",
    partIds,
    reasons: {},
    budgetUsd,
    routine: waterTask.targetIds.flatMap((t) => [{ op: "goto" as const, target: t }, { op: "pump_on" as const, value: 2 }, { op: "pump_off" as const }]),
  };
}

const failed = (d: ReturnType<typeof deriveAndCheck>) => d.checks.filter((c) => !c.ok).map((c) => c.id).sort();

const CHEAP = ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "arm-mearm", "servo-pca9685", "tool-pump-submersible", "tank-500", "bat-nimh-2200", "reg-5v-3a"];
const MID = ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "arm-lact10p", "tool-pump-peristaltic", "tank-500", "bat-nimh-2200", "reg-5v-3a", "adc-ads1115"];

test("cheap fixed-arm build fails only reach (table and shelf plants)", () => {
  const d = deriveAndCheck(design(CHEAP), waterTask, room, catalog);
  assert.deepEqual(failed(d), ["reach"], failureText(d));
  const reach = d.checks.find((c) => c.id === "reach")!;
  assert.match(reach.message, /succulent on top of the bookshelf/);
  assert.doesNotMatch(reach.message, /fern on the floor/);
});

test("mid build with extendable arm passes every check", () => {
  const d = deriveAndCheck(design(MID), waterTask, room, catalog);
  assert.deepEqual(failed(d), [], failureText(d));
  assert.ok(d.totalUsd > 0 && d.totalUsd <= 500);
  assert.equal(d.footprint.w, 180);
  assert.ok(d.pinMap.some((p) => p.partId === "md-motor-hat" && p.pins.includes("GPIO2 (SDA)")));
});

test("too-wide build fails the doorway check", () => {
  const wide: Part = { ...catalog.find((p) => p.id === "chassis-4wd-l")!, id: "chassis-wide-test", dims: { l: 900, w: 900, h: 100 } };
  const ids = MID.map((id) => (id === "chassis-4wd-m" ? "chassis-wide-test" : id));
  const d = deriveAndCheck(design(ids), waterTask, room, [...catalog, wide]);
  assert.ok(failed(d).includes("doorway"), failureText(d));
});

test("invented part ids, missing driver channels and over-budget are reported", () => {
  const ids = ["chassis-4wd-m", "pi4b-4gb", "md-tb6612", "arm-lact10p", "tool-pump-peristaltic", "tank-500", "bat-nimh-2200", "reg-5v-3a", "laser-cannon"];
  const d = deriveAndCheck(design(ids, 100), waterTask, room, catalog);
  const f = failed(d);
  for (const id of ["part-ids", "motor-channels", "budget"]) assert.ok(f.includes(id), `${id} should fail: ${failureText(d)}`);
});

test("USB power bank alone cannot power a Pi 4", () => {
  const ids = MID.map((id) => (id === "reg-5v-3a" ? "bat-usb-10000" : id));
  const d = deriveAndCheck(design(ids), waterTask, room, catalog);
  assert.ok(failed(d).includes("power-supply"), failureText(d));
});

test("no battery fails with an add-a-battery message", () => {
  const d = deriveAndCheck(design(MID.filter((id) => id !== "bat-nimh-2200")), waterTask, room, catalog);
  const b = d.checks.find((c) => c.id === "battery")!;
  assert.equal(b.ok, false);
  assert.match(b.message, /no battery/);
});

test("GPIO overflow fails the pin budget", () => {
  const ids = [...MID, ...Array(13).fill("us-rcwl1601")]; // 26 GPIO pins with I2C reserved
  const d = deriveAndCheck(design(ids, 5000), waterTask, room, catalog);
  assert.ok(failed(d).includes("pin-budget"), failureText(d));
});

test("missing tank says to add one", () => {
  const d = deriveAndCheck(design(MID.filter((id) => id !== "tank-500")), waterTask, room, catalog);
  assert.match(d.checks.find((c) => c.id === "tank")!.message, /no tank/);
});

test("a 2-wheel chassis fails the structure check (forced 4-wheel rule)", () => {
  const d = deriveAndCheck(design(CHEAP.map((id) => (id === "chassis-4wd-m" ? "chassis-2wd-m" : id))), waterTask, room, catalog);
  const s = d.checks.find((c) => c.id === "structure")!;
  assert.equal(s.ok, false);
  assert.match(s.message, /at least 4 wheels/);
});

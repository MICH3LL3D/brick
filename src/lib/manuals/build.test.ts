import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design } from "../contracts";
import { loadCatalog, loadRoom } from "../data";
import { deriveAndCheck } from "../derive";
import { planBooks, shortName } from "./build";

const catalog = loadCatalog();
const design = (partIds: string[]): Design => ({ summary: "test robot", partIds, reasons: {}, routine: [{ op: "return_home" }], budgetUsd: 500 });
const plan = (ids: string[]) => {
  const d = design(ids);
  return planBooks(d, deriveAndCheck(d, { prompt: "t", targetIds: [] }, loadRoom(), catalog), catalog);
};
const BASE = ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "bat-nimh-2200", "reg-5v-3a"];

test("books without matching parts are left out", () => {
  const ids = plan(BASE).map((p) => p.id);
  for (const absent of ["5", "6", "7"]) assert.ok(!ids.includes(absent as never), `book ${absent}`);
  const full = plan([...BASE, "arm-lact12p", "tool-pump-peristaltic", "tank-1000", "us-hcsr04"]).map((p) => p.id);
  for (const present of ["5", "6", "7"]) assert.ok(full.includes(present as never), `book ${present}`);
});

test("wires come from the pin map and the power wiring from the real parts", () => {
  const books = plan([...BASE, "us-hcsr04"]);
  const eyes = books.find((p) => p.id === "6")!.slots[0];
  assert.ok(eyes.wires!.some((w) => /TRIG|ECHO/.test(w.to)), "sensor roles named");
  const power = books.find((p) => p.id === "3")!.slots;
  assert.ok(power[0].wires!.length >= 4 && power[1].gauge, "battery to regulator to Pi, plus a 5V check");
});

test("every slot id is unique and short names keep a short first half", () => {
  const ids = plan(BASE).flatMap((p) => p.slots.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(shortName({ ...catalog[0], name: "Pirate - 4WD Mobile Platform" }), "Pirate - 4WD Mobile Platform");
  assert.equal(shortName({ ...catalog[0], name: "Raspberry Pi 4 Model B - 4 GB RAM" }), "Raspberry Pi 4 Model B");
});

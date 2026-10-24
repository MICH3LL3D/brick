import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "../contracts";
import { loadCatalog } from "../data";
import { layoutRobot, type Placed } from "./layout";

const catalog = loadCatalog();
const byId = new Map(catalog.map((p) => [p.id, p]));
const CACHE = join(__dirname, "../../../data/cache");
const demos = readdirSync(CACHE).map((f) => JSON.parse(readFileSync(join(CACHE, f), "utf8")).design as Design);
const partsOf = (d: Design) => d.partIds.map((id) => byId.get(id)!).filter(Boolean);

const overlaps = (a: Placed, b: Placed) =>
  [0, 1, 2].every((i) => Math.abs(a.pos[i] - b.pos[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);

test("sizes come from catalog dims in metres", () => {
  for (const d of demos) {
    const l = layoutRobot(partsOf(d));
    for (const it of l.items) {
      assert.deepEqual(it.size.map((v) => Math.round(v * 1000)), [it.part.dims.l, it.part.dims.h, it.part.dims.w]);
    }
    assert.ok(l.chassis);
    assert.equal(Math.round(l.chassis!.size[0] * 1000), l.chassis!.part.dims.l);
  }
});

test("every part is placed once, with unique keys", () => {
  for (const d of demos) {
    const l = layoutRobot(partsOf(d));
    const keys = [l.chassis?.key, l.arm?.key, l.tool?.key, ...l.items.map((i) => i.key)].filter(Boolean);
    assert.equal(keys.length, d.partIds.length);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("deck parts sit on or above the deck and do not overlap each other", () => {
  for (const d of demos) {
    const l = layoutRobot(partsOf(d));
    const deck = l.items.filter((i) => i.role === "deck");
    for (const it of deck) assert.ok(it.pos[1] - it.size[1] / 2 >= l.deckY - 1e-6, `${it.key} below deck`);
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
      assert.ok(!overlaps(deck[i], deck[j]), `${deck[i].key} overlaps ${deck[j].key}`);
    }
  }
});

test("4WD chassis gets 4 wheels touching the floor; 2WD gets 2", () => {
  const four = layoutRobot([byId.get("chassis-4wd-m")!]);
  const two = layoutRobot([byId.get("chassis-2wd-s")!]);
  assert.equal(four.wheels.length, 4);
  assert.equal(two.wheels.length, 2);
  for (const w of four.wheels) assert.ok(Math.abs(w.pos[1] - w.radius) < 1e-9);
});

test("extendable arm is detected and carries the tool", () => {
  const l = layoutRobot(["chassis-4wd-m", "arm-lact10p", "tool-gripper"].map((id) => byId.get(id)!));
  assert.ok(l.arm?.extendable);
  assert.ok(l.arm!.liftMaxM > l.arm!.baseSize[1]);
  assert.equal(l.tool?.part.id, "tool-gripper");
  const fixed = layoutRobot(["chassis-4wd-m", "arm-mearm"].map((id) => byId.get(id)!));
  assert.equal(fixed.arm?.extendable, false);
});

test("duplicate parts get distinct keys", () => {
  const l = layoutRobot(["chassis-4wd-m", "md-tb6612", "md-tb6612"].map((id) => byId.get(id)!));
  assert.deepEqual(l.items.map((i) => i.key).sort(), ["md-tb6612", "md-tb6612#2"]);
});

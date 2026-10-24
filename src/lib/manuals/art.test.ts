import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf } from "../part-kind";
import { loadCatalog } from "../data";
import { Art, IconName } from "../manual-format";

test("every catalog part gets a drawing kind, so a missing photo never leaves a slot empty", () => {
  for (const p of loadCatalog()) assert.ok(kindOf(p), p.id);
});

test("pumps and tanks are told apart from other tools and misc parts", () => {
  const byId = (id: string) => loadCatalog().find((p) => p.id === id)!;
  assert.equal(kindOf(byId("tank-500")), "tank");
  assert.equal(kindOf(byId("tool-pump-peristaltic")), "pump");
  assert.equal(kindOf(byId("us-hcsr04")), "ultrasonic");
});

test("part and icon art validate in the manual format", () => {
  assert.ok(Art.safeParse({ kind: "part", partId: "pi4b-4gb" }).success);
  for (const name of IconName.options) assert.ok(Art.safeParse({ kind: "icon", name }).success, name);
});

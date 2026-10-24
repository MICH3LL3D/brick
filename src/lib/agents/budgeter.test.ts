import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOptions, type Option } from "./budgeter";

const price = new Map([["a1", 10], ["a2", 30], ["b1", 20], ["b2", 25], ["b3", 60]]);
const o = (id: string): Option => ({ partIds: [id], reasons: [], tradeoff: "" });
const groups = [[o("a1"), o("a2")], [o("b1"), o("b2"), o("b3")]];

test("tight never upgrades", () => assert.deepEqual(pickOptions(groups, 500, "tight", price), [0, 0]));
test("over budget still returns the cheapest team", () => assert.deepEqual(pickOptions(groups, 5, "generous", price), [0, 0]));
test("normal upgrades one step per group, only when it fits", () => {
  assert.deepEqual(pickOptions(groups, 52, "normal", price), [1, 0]); // a2 -> 50 fits; b2 -> 55 does not
  assert.deepEqual(pickOptions(groups, 1000, "normal", price), [1, 1]);
});
test("generous upgrades as far as the money goes", () => assert.deepEqual(pickOptions(groups, 95, "generous", price), [1, 2]));

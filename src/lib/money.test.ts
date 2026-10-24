import { test } from "node:test";
import assert from "node:assert/strict";
import { sumUsd, usd } from "./money";

test("float sums stay in cents", () => {
  assert.equal(0.1 + 0.2 === 0.3, false);
  assert.equal(usd(sumUsd([0.1, 0.2])), "$0.30");
  assert.equal(usd(624.2000000000002), "$624.20");
  assert.equal(usd(240 - 624.2000000000002), "-$384.20");
});

test("whole dollars drop the cents", () => {
  assert.equal(usd(54), "$54");
  assert.equal(usd(1234), "$1,234");
  assert.equal(usd(12.5), "$12.50");
});

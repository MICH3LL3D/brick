// Run: npm test   (needs --conditions=react-server because generate.ts imports "server-only")
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, loadRoom } from "./data";
import { systemPrompt, toAttempt } from "./generate";
import { readCache, readEntry, slug } from "./demo-cache";

const catalog = loadCatalog();
const room = loadRoom();
const water = readEntry("water my plants")!;

/* ---------- toAttempt ---------- */

test("toAttempt: reasons array becomes a record; unknown target ids are dropped", () => {
  const { partIds, routine, summary } = water.design;
  const a = toAttempt(
    {
      targetIds: [...water.task.targetIds, "not-a-target"],
      summary,
      partIds,
      reasons: [...partIds.map((id) => ({ partId: id, reason: `why ${id}` })), { partId: "cam-pi3", reason: "not in the design" }],
      routine,
    },
    "water my plants",
    500,
    room,
    catalog,
  );
  assert.deepEqual(a.task.targetIds, water.task.targetIds);
  assert.equal(a.design.reasons["tool-pump-submersible"], "why tool-pump-submersible");
  assert.equal(a.design.reasons["cam-pi3"], undefined);
  assert.equal(Object.keys(a.design.reasons).length, new Set(partIds).size);
  assert.equal(a.design.budgetUsd, 500);
  assert.ok(!a.derived.checks.some((c) => c.id === "reasons"));
});

test("toAttempt: missing reasons add a failing 'reasons' check", () => {
  const { partIds, routine, summary } = water.design;
  const a = toAttempt({ targetIds: water.task.targetIds, summary, partIds, reasons: [], routine }, "water my plants", 500, room, catalog);
  const check = a.derived.checks.find((c) => c.id === "reasons");
  assert.ok(check && !check.ok);
  assert.ok(a.failed >= 1);
  for (const id of partIds) assert.ok(check.message.includes(id), id);
});

test("systemPrompt lists every catalog id and no room targets", () => {
  const s = systemPrompt(catalog);
  for (const p of catalog) assert.ok(s.includes(p.id), p.id);
  for (const t of room.targets) assert.ok(!s.includes(t.id), t.id);
});

/* ---------- demo cache ---------- */

test("slug", () => {
  assert.equal(slug("Water my plants!"), "water-my-plants");
});

const PROMPTS = ["water my plants", "bring my water bottle from the desk to the couch", "patrol the apartment and take photos of the windows"];

for (const prompt of PROMPTS) {
  test(`readCache: "${prompt}" passes and recomputes checks at a given budget`, () => {
    const r = readCache(prompt, room, catalog);
    assert.ok(r, "cache hit");
    assert.equal(r.source, "cache");
    assert.equal(r.ok, true, r.derived.checks.filter((c) => !c.ok).map((c) => c.message).join(" "));

    const low = readCache(prompt, room, catalog, 100)!;
    assert.equal(low.design.budgetUsd, 100);
    const budget = low.derived.checks.find((c) => c.id === "budget");
    assert.ok(budget && !budget.ok, "budget check fails at $100");
    assert.equal(low.ok, false);
  });
}

test("readCache: malformed or missing cache file is a miss", () => {
  const dir = mkdtempSync(join(tmpdir(), "cache-test-"));
  try {
    writeFileSync(join(dir, "water-my-plants.json"), "{ not json");
    writeFileSync(join(dir, "patrol.json"), JSON.stringify({ prompt: "patrol" }));
    assert.equal(readCache("water my plants", room, catalog, undefined, dir), null);
    assert.equal(readCache("patrol", room, catalog, undefined, dir), null);
    assert.equal(readCache("nothing here", room, catalog, undefined, dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

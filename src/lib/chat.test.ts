// Run: npm test   (needs --conditions=react-server because chat.ts imports "server-only")
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Design } from "./contracts";
import { loadCatalog, loadRoom } from "./data";
import { deriveAndCheck } from "./derive";
import { offlineChat, postProcess, type ChatMessage } from "./chat";
import { readEntry } from "./demo-cache";

const catalog = loadCatalog();
const room = loadRoom();
const water = readEntry("water my plants")!;
const { task } = water;
const design: Design = water.design;
const user = (content: string): ChatMessage[] => [{ role: "user", content }];
const ask = (q: string, d: Design = design) => offlineChat(user(q), d, task, room, catalog);

/* ---------- offlineChat ---------- */

test("offline: 'make it cheaper' sets a lower budget, at least $50", () => {
  const r = ask("make it cheaper");
  assert.equal(r.source, "offline");
  assert.equal(r.actions.length, 1);
  const a = r.actions[0];
  assert.equal(a.type, "set_budget");
  if (a.type !== "set_budget") return;
  assert.ok(a.budgetUsd < design.budgetUsd, `${a.budgetUsd} < ${design.budgetUsd}`);
  assert.ok(a.budgetUsd >= 50);
});

test("offline: 'why is it so expensive?' explains the total, no action", () => {
  const r = ask("why is it so expensive?");
  assert.deepEqual(r.actions, []);
  const total = deriveAndCheck(design, task, room, catalog).totalUsd;
  assert.ok(r.reply.includes(`$${total.toFixed(2)}`), r.reply);
});

test("offline: 'why did you pick the pump' is about the pump, not the Pi", () => {
  const r = ask("why did you pick the pump");
  assert.deepEqual(r.actions, []);
  const pump = catalog.find((p) => p.id === "tool-pump-submersible")!;
  const pi = catalog.find((p) => p.id === "pi4b-4gb")!;
  assert.ok(r.reply.includes(pump.name), r.reply);
  assert.ok(!r.reply.includes(pi.name), r.reply);
});

test("offline: non-edit messages give no action", () => {
  for (const q of ["tell me more about the arm", "what's my budget?"]) {
    assert.deepEqual(ask(q).actions, [], q);
  }
});

test("offline: budget already at $50 gives no action", () => {
  const r = ask("make it cheaper", { ...design, budgetUsd: 50 });
  assert.deepEqual(r.actions, []);
});

/* ---------- postProcess (chat honesty rules, no network) ---------- */

const pp = (text: string, calls: Parameters<typeof postProcess>[1], d: Design = design) => postProcess(text, calls, d, task, room, catalog);

test("swap_part across categories is rejected and the reply does not claim it", () => {
  const r = pp("Done! I swapped the pump for the camera.", [{ name: "swap_part", args: { removeId: "tool-pump-submersible", addId: "cam-pi3" } }]);
  assert.deepEqual(r.actions, []);
  assert.ok(!/swapped/i.test(r.reply), r.reply);
  assert.match(r.reply, /same kind/);
});

test("swap_part adding a part already in the design is rejected", () => {
  const r = pp("Swapped!", [{ name: "swap_part", args: { removeId: "tool-pump-submersible", addId: "tank-500" } }]);
  assert.deepEqual(r.actions, []);
  assert.match(r.reply, /already in the design/);
});

test("sequential swaps are validated against the updated design", () => {
  const r = pp("", [
    { name: "swap_part", args: { removeId: "tool-pump-submersible", addId: "tool-pump-peristaltic" } },
    { name: "swap_part", args: { removeId: "tool-pump-peristaltic", addId: "tool-pump-gravity" } },
  ]);
  assert.deepEqual(r.actions.map((a) => a.type), ["swap_part", "swap_part"], r.reply);

  // The first swap removed the submersible pump, so a second swap of it must be rejected.
  const again = pp("", [
    { name: "swap_part", args: { removeId: "tool-pump-submersible", addId: "tool-pump-peristaltic" } },
    { name: "swap_part", args: { removeId: "tool-pump-submersible", addId: "tool-pump-gravity" } },
  ]);
  assert.equal(again.actions.length, 1);
  assert.match(again.reply, /isn't in this design/);
});

test("a reply quoting an unknown $ amount is replaced", () => {
  const r = pp("That pump costs $123.45, a real bargain!", []);
  assert.ok(!r.reply.includes("123.45"), r.reply);
  assert.match(r.reply, /I'm not sure about exact prices/);
});

test("a reply quoting a known catalog price is kept", () => {
  const text = "The pump is only $2.95.";
  assert.equal(pp(text, []).reply, text);
});

test("tool args cannot override the tool name", () => {
  const r = pp("", [{ name: "set_budget", args: { type: "swap_part", removeId: "tool-pump-submersible", addId: "tool-pump-gravity", budgetUsd: 200 } }]);
  assert.equal(r.actions.length, 1);
  assert.deepEqual(r.actions[0], { type: "set_budget", budgetUsd: 200 });
});

test("set_budget outside $50-$500 is rejected", () => {
  const r = pp("Moved it to $20!", [{ name: "set_budget", args: { budgetUsd: 20 } }]);
  assert.deepEqual(r.actions, []);
  assert.match(r.reply, /\$50 to \$500/);
});

/* ---------- room-free designs (task.requirements) ---------- */

const reqTask = {
  prompt: "grab books from the shelf",
  targetIds: [],
  requirements: {
    feasible: true, notes: "Light paperbacks only.", actions: ["pick up"], reachHeightMm: 1000, reachOutMm: 0, gripWidthMm: 40,
    liftMassG: 300, carryMassG: 0, liquidMl: 0, needsCamera: false, needsDistanceSensor: false, maxWidthMm: 0, runtimeMin: 0,
  },
};

test("offline with requirements: 'why this arm?' cites the task's reach", () => {
  const hasArm = design.partIds.some((id) => catalog.find((p) => p.id === id)?.category === "arm");
  const armDesign: Design = hasArm ? design : { ...design, partIds: [...design.partIds, catalog.find((p) => p.category === "arm")!.id] };
  const r = offlineChat(user("why this arm?"), armDesign, reqTask, room, catalog);
  assert.match(r.reply, /reach 1,000 mm high/);
});

test("offline with requirements: limitations are quoted, and old tasks still answer", () => {
  const r = offlineChat(user("what can't it do?"), design, reqTask, room, catalog, ["No catalog part can handle lifting 5000 g."]);
  assert.match(r.reply, /5000 g/);
  assert.ok(ask("why this arm?").reply.length > 0);
});

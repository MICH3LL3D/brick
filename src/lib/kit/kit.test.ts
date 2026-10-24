// Run: npm test   (node:test via tsx, with --conditions=react-server so "server-only" imports resolve)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import type { Design, Part } from "../contracts";
import { loadCatalog, loadRoom, type Task } from "../data";
import { deriveAndCheck } from "../derive";
import { simulate } from "../sim-stub";
import { buyListCsv } from "./buylist";
import { pyCompileErrors } from "./compile";
import { buildKit, KitCheckError } from "./index";
import { piFiles, type KitFile } from "./pi";
import { wiringMd } from "./wiring";

const catalog = loadCatalog();
const room = loadRoom();

const CACHE_DIR = join(__dirname, "../../../data/cache");
const demos = readdirSync(CACHE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const entry = JSON.parse(readFileSync(join(CACHE_DIR, f), "utf8")) as { task: Task; design: Design };
    return { name: f, task: entry.task, design: entry.design };
  });

function kitCode(design: Design, task: Task): KitFile[] {
  const derived = deriveAndCheck(design, task, room, catalog);
  const sim = simulate(design, task, room, catalog);
  return piFiles(design, task, derived, sim, room, catalog);
}

const file = (files: KitFile[], path: string) => {
  const f = files.find((x) => x.path === path);
  assert.ok(f, `missing ${path}`);
  return f.content;
};

/** Parses a `NAME = <json-compatible python literal>  # comment` line from config.py. */
function configValue(config: string, name: string): unknown {
  const line = config.split("\n").find((l) => l.startsWith(`${name} = `));
  assert.ok(line, `config.py has no ${name}`);
  const literal = line.slice(name.length + 3).replace(/\s+#.*$/, "");
  return JSON.parse(literal.replace(/\bNone\b/g, "null").replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false"));
}

/* ---------- buy list ---------- */

test("buyListCsv: duplicate ids become quantity, names are quoted, total row sums lines", () => {
  const base = catalog.find((p) => p.id === "md-tb6612")!;
  const odd: Part = { ...base, id: "odd-name-test", name: 'Driver, "deluxe" edition', priceUsd: 2.5 };
  const design: Design = { summary: "t", partIds: ["md-tb6612", "md-tb6612", "odd-name-test", "not-in-catalog"], reasons: {}, routine: [], budgetUsd: 100 };
  const lines = buyListCsv(design, [...catalog, odd]).trimEnd().split("\n");
  assert.equal(lines[0], "part,vendor,url,price,qty,verified");
  assert.equal(lines.length, 4, "header + 2 distinct parts + total");
  const tb = lines.find((l) => l.startsWith(base.name.includes(",") ? `"${base.name}` : base.name))!;
  assert.ok(tb, "tb6612 row");
  assert.equal(tb.split(",").at(-2), "2", "qty 2 for duplicate id");
  assert.ok(lines.some((l) => l.startsWith('"Driver, ""deluxe"" edition",')), "commas and quotes are CSV-escaped");
  const total = (base.priceUsd * 2 + 2.5).toFixed(2);
  assert.equal(lines.at(-1), `TOTAL,,,${total},,`);
});

/* ---------- wiring ---------- */

test("wiringMd labels driver and sensor pins with their roles", () => {
  const design: Design = {
    summary: "t",
    partIds: ["pi4b-4gb", "chassis-2wd-s", "md-tb6612", "us-hcsr04", "bat-nimh-900", "reg-5v-3a"],
    reasons: {}, routine: [], budgetUsd: 500,
  };
  const task: Task = { prompt: "t", targetIds: [] };
  const md = wiringMd(design, deriveAndCheck(design, task, room, catalog), catalog);
  for (const role of ["AIN1", "AIN2", "PWMA", "BIN1", "BIN2", "PWMB", "STBY", "TRIG", "ECHO"]) {
    assert.match(md, new RegExp(`GPIO\\d+ = ${role}\\b`), `wiring.md labels ${role}`);
  }
});

/* ---------- Pi code for the demo designs ---------- */

test("there are 3 cached demo designs", () => {
  assert.equal(demos.length, 3);
});

for (const demo of demos) {
  test(`piFiles(${demo.name}): every .py compiles`, async () => {
    const errors = await pyCompileErrors(kitCode(demo.design, demo.task));
    assert.deepEqual(errors, []);
  });

  test(`piFiles(${demo.name}): one LEGS entry per goto with a target`, () => {
    const files = kitCode(demo.design, demo.task);
    const gotos = demo.design.routine.filter((s) => s.op === "goto" && s.target).length;
    const legs = configValue(file(files, "pi/config.py"), "LEGS") as unknown[];
    assert.equal(legs.length, gotos);
    assert.equal(file(files, "pi/main.py").match(/drive\.follow\(config\.LEGS\[/g)?.length ?? 0, gotos);
  });
}

test("duplicate motor drivers get distinct GPIO pins", () => {
  const demo = demos.find((d) => d.design.partIds.filter((id) => id === "md-tb6612").length === 2);
  assert.ok(demo, "a demo design uses two TB6612 drivers");
  const config = file(kitCode(demo.design, demo.task), "pi/config.py");
  const block = /MOTOR_CHANNELS = \{\n([\s\S]*?)\n\}/.exec(config)![1];
  const channels = block.split("\n").map((l) => JSON.parse(l.trim().replace(/^"[A-Z]": /, "").replace(/,$/, "")) as Record<string, unknown>);
  assert.equal(channels.length, 4);
  const pins = channels.flatMap((c) => [c.forward, c.backward, c.enable]);
  assert.ok(pins.every((p) => typeof p === "number"), `every channel pin is set: ${pins}`);
  assert.equal(new Set(pins).size, pins.length, `pins are distinct: ${pins}`);
  const alwaysOn = configValue(config, "ALWAYS_ON_PINS") as number[];
  assert.equal(alwaysOn.length, 2);
  assert.equal(new Set([...pins, ...alwaysOn]).size, pins.length + 2, "STBY pins are distinct too");
});

/* ---------- pan/tilt camera mount ---------- */

const PATROL_PANTILT: Design = {
  summary: "patrol with a pan/tilt camera",
  partIds: ["pi4b-4gb", "chassis-2wd-s", "md-tb6612", "bat-nimh-900", "reg-5v-3a", "cam-pi3", "tool-cam-pantilt", "servo-pca9685"],
  reasons: {},
  routine: [
    { op: "goto", target: "window-living" }, { op: "photograph", target: "window-living" },
    { op: "goto", target: "window-office" }, { op: "photograph", target: "window-office" },
    { op: "return_home" },
  ],
  budgetUsd: 500,
};
const patrolTask: Task = { prompt: "Patrol the apartment and take photos of the windows", targetIds: ["window-living", "window-office"] };

test("tool-cam-pantilt: pan_tilt.py is emitted, main centers before each photo, selftest wiggles it", async () => {
  const files = kitCode(PATROL_PANTILT, patrolTask);
  const driver = file(files, "pi/drivers/pan_tilt.py");
  assert.match(driver, /def look\(self, pan=0, tilt=0\)/);
  assert.match(driver, /def center\(self\)/);
  const servo = configValue(file(files, "pi/config.py"), "SERVO_CHANNELS") as Record<string, number[]>;
  assert.equal(servo.pan_tilt?.length, 2);
  const main = file(files, "pi/main.py");
  assert.match(main, /from drivers\.pan_tilt import PanTilt/);
  const lines = main.split("\n");
  const photos = lines.flatMap((l, i) => (l.includes("camera.photo(") ? [i] : []));
  assert.equal(photos.length, 2);
  for (const i of photos) assert.equal(lines[i - 1].trim(), "pan_tilt.center()");
  assert.match(file(files, "pi/selftest.py"), /check\("pan\/tilt mount"/);
  assert.deepEqual(await pyCompileErrors(files), []);
});

test("designs without tool-cam-pantilt do not emit pan_tilt.py", () => {
  for (const demo of demos) {
    assert.ok(!kitCode(demo.design, demo.task).some((f) => f.path.endsWith("pan_tilt.py")), demo.name);
  }
});

/* ---------- buildKit ---------- */

test("buildKit throws KitCheckError for a design without a motor driver", async () => {
  const design: Design = { ...PATROL_PANTILT, partIds: PATROL_PANTILT.partIds.filter((id) => id !== "md-tb6612") };
  await assert.rejects(buildKit(design, patrolTask, room, catalog, false), KitCheckError);
});

test("buildKit zips pan_tilt.py for a pan/tilt design", async () => {
  const zip = await JSZip.loadAsync(await buildKit(PATROL_PANTILT, patrolTask, room, catalog, false));
  assert.ok(zip.file("robot-kit/pi/drivers/pan_tilt.py"));
  assert.ok(zip.file("robot-kit/README.md"));
});

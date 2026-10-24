// Writes the build manuals for one design (brief 7, B's half).
// Code decides which books and pages exist and supplies everything checkable: parts, quantities, wires and pins
// (from derive.pinMap), the voltage gauge, SEE links. Gemini writes only the words: one writer agent per book, then
// a fact-checker reviews every sentence against the catalog data. Photo agents supply real product pictures.
import "server-only";
import { z } from "zod";
import { ask } from "../agents/team";
import type { Design, Part } from "../contracts";
import type { Derived } from "../data";
import { isBattery, isPump, isRegulator, isTank, resolveParts } from "../derive";
import { catalogLines } from "../generate";
import { findPartImages } from "../images/agents";
import type { PartImage } from "../images/store";
import { labelPins } from "../kit/wiring";
import { boardPinOf } from "../pi-header";
import { BOOKS, IconName, ManualSet, type BookIdT, type IconNameT, type ManualPageT, type ManualSetT } from "../manual-format";

type Say = (text: string) => void;
type End = { dev: string; port: string; pin?: number };
type Wire = { color: "red" | "black" | "orange" | "blue" | "yellow" | "white" | "green" | "purple" | "brown" | "grey"; from: string; to: string; isNew: boolean; a?: End; b?: End };
type Slot = { id: string; kind: "steps" | "wiring" | "fix" | "skill" | "shelf" | "parts" | "legend"; title: string; hint: string; panels: number; wires?: Wire[]; gauge?: { reading: string; expect: string } };
type Plan = { id: BookIdT; goal: string; partIds: string[]; slots: Slot[] };

const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const COLORS: Wire["color"][] = ["orange", "blue", "yellow", "green", "purple", "white", "brown", "grey"];
const bookName = (id: BookIdT) => BOOKS.find((b) => b.id === id)!.name;
/** "Raspberry Pi 4 Model B - 4 GB RAM" -> "Raspberry Pi 4 Model B": the label that fits a parts box. */
export const shortName = (p: Part) => {
  let name = p.name.split(/ \(| for /)[0];
  for (const sep of [" - ", ", "]) {
    const left = name.split(sep)[0];
    if (left.length >= 12) name = left; // "Pirate - 4WD Mobile Platform" and "5V, 3A Step-Down Regulator" keep their second half
  }
  return name.length > 40 ? clip(name.slice(0, 40).replace(/\s+\S*$/, ""), 40) : clip(name, 40); // cut at a word, not mid-word
};

/** Default drawing for a step that shows no part. */
const SLOT_ICON: Record<string, IconNameT> = { "2.1": "sdcard", "8.1": "power", "9.1": "terminal", "S.1": "wire", "S.2": "wire", "S.3": "multimeter", "S.4": "header" };

const SKILLS: Slot[] = [
  { id: "S.1", kind: "skill", title: "Strip a wire", hint: "Remove about 6 mm of insulation without cutting the strands.", panels: 3 },
  { id: "S.2", kind: "skill", title: "Lever block", hint: "Join wires with a lever block, no soldering.", panels: 3 },
  { id: "S.3", kind: "skill", title: "Use a multimeter", hint: "Measure DC volts safely.", panels: 3 },
  { id: "S.4", kind: "skill", title: "Find pin 1", hint: "Count the Raspberry Pi header from pin 1; the GPIO number is not the pin number.", panels: 2 },
];

/* ---------- Plan: code decides the pages and the checkable content ---------- */

export function planBooks(design: Design, derived: Derived, catalog: Part[]): Plan[] {
  const r = resolveParts(design, catalog);
  const ids = (pred: (p: Part) => boolean) => [...new Set(r.parts.filter(pred).map((p) => p.id))];
  const batteries = r.parts.filter(isBattery);
  const usb = batteries.find((b) => b.caps.outputV === 5);
  const main = batteries.find((b) => b !== usb) ?? batteries[0];
  const regulator = r.parts.find(isRegulator);
  const drivers = r.parts.filter((p) => p.category === "motor_driver");
  const sensors = r.parts.filter((p) => p.category === "sensor");
  const pinWires = (match: (p: Part) => boolean, to: (p: Part, role?: string) => string): Wire[] =>
    derived.pinMap.flatMap((m) => {
      const p = catalog.find((c) => c.id === m.partId);
      if (!p || !match(p)) return [];
      return labelPins(p, m.pins).map((l, i) => {
        const [pin, named] = l.split(" = ");
        const role = named ?? /\((\w+)\)/.exec(pin)?.[1]; // I2C pins carry their role in brackets, e.g. "GPIO2 (SDA)"
        const header = boardPinOf(pin);
        return { color: COLORS[i % COLORS.length], from: `Pi ${pin}`, to: to(p, role), isNew: true, ...(header ? { a: { dev: "Raspberry Pi", port: clip(pin.replace(/\s*\(.*\)/, ""), 30), pin: header }, b: { dev: shortName(p), port: clip(role, 30) } } : {}) };
      });
    });

  const powerWires: Wire[] = [];
  const PI = "Raspberry Pi";
  const w = (color: Wire["color"], a: End, b: End): Wire => ({ color, from: `${a.dev} ${a.port}`, to: `${b.dev} ${b.port}`, isNew: true, a, b });
  if (usb) powerWires.push(w("grey", { dev: shortName(usb), port: "USB-C" }, { dev: PI, port: "USB-C" }));
  if (main && main !== usb) {
    const m = shortName(main);
    const hub = regulator ? shortName(regulator) : drivers[0] ? shortName(drivers[0]) : undefined;
    if (hub) powerWires.push(w("red", { dev: m, port: "+" }, { dev: hub, port: regulator ? "IN+" : "motor power +" }), w("black", { dev: m, port: "-" }, { dev: hub, port: regulator ? "IN-" : "motor power -" }));
    if (regulator && !usb) {
      const r = shortName(regulator);
      powerWires.push(w("red", { dev: r, port: "OUT+" }, { dev: PI, port: "5V", pin: 2 }), w("black", { dev: r, port: "OUT-" }, { dev: PI, port: "GND", pin: 6 }));
    }
    if (regulator) for (const d of drivers) powerWires.push(w("red", { dev: m, port: "+" }, { dev: shortName(d), port: "motor power +" }), w("black", { dev: m, port: "-" }, { dev: shortName(d), port: "motor power -" }));
  }

  const power: Slot[] = [{ id: "3.1", kind: "wiring", title: "Wire the power", hint: "Battery to the regulator and motor driver; battery stays unplugged until the Switch on book.", panels: 0, wires: powerWires }];
  if (regulator && !usb) power.push({ id: "3.2", kind: "wiring", title: "Check the 5V", hint: "Plug in the battery, read the regulator output with a multimeter, then unplug.", panels: 0, wires: [], gauge: { reading: "5.0 V", expect: "Must read 4.9 to 5.1 V" } });

  const steps = (book: string, i: number, title: string, hint: string, panels = 3): Slot => ({ id: `${book}.${i}`, kind: "steps", title, hint, panels });
  const pumpIds = ids((p) => isPump(p) || isTank(p));
  const plans: Plan[] = [
    { id: "0", goal: "Introduce the build: how the books fit together and what to buy and gather.", partIds: [], slots: [
      { id: "0.1", kind: "shelf", title: "Start here", hint: "Overview of the 12 books.", panels: 0 },
      { id: "0.2", kind: "parts", title: "Parts and tools", hint: "Everything to have on the table.", panels: 0 },
      { id: "0.3", kind: "legend", title: "How to read these books", hint: "", panels: 0 }] },
    { id: "1", goal: "Assemble the chassis.", partIds: ids((p) => p.category === "chassis"), slots: [steps("1", 1, "Build the base", "Open the chassis kit, mount motors and wheels, find the deck where everything else sits.")] },
    { id: "2", goal: "Set up the Raspberry Pi.", partIds: ids((p) => p.category === "controller"), slots: [steps("2", 1, "Set up the Pi", "Flash the card, set hostname, Wi-Fi and SSH, then mount the Pi on the deck.")] },
    { id: "3", goal: "Wire the power system.", partIds: ids((p) => p.category === "power"), slots: power },
    { id: "4", goal: "Wire the motor driver and wheels.", partIds: ids((p) => p.category === "motor_driver"), slots: [{ id: "4.1", kind: "wiring", title: "Wire the drive", hint: "Connect the Pi pins to the motor driver as listed.", panels: 0, wires: pinWires((p) => p.category === "motor_driver", (p, role) => (role ? `${shortName(p)} ${role}` : shortName(p))) }] },
  ];
  if (r.arm) plans.push({ id: "5", goal: "Mount and wire the arm.", partIds: ids((p) => p.category === "arm" || p.category === "misc" && p.caps.interface === "i2c"), slots: [steps("5", 1, "Mount the arm", "Fix the arm to the deck, connect its power and control wires, test its motion.")] });
  if (sensors.length) plans.push({ id: "6", goal: "Wire the sensors.", partIds: ids((p) => p.category === "sensor"), slots: [{ id: "6.1", kind: "wiring", title: "Wire the sensors", hint: "Connect each sensor to the Pi pins as listed.", panels: 0, wires: pinWires((p) => p.category === "sensor", (p, role) => (role ? `${shortName(p)} ${role}` : shortName(p))) }] });
  if (pumpIds.length) plans.push({ id: "7", goal: "Install the water system.", partIds: pumpIds, slots: [steps("7", 1, "Plumb the pump", "Mount the tank and pump, connect the tubing, wire the pump through the driver.")] });
  plans.push(
    { id: "8", goal: "Check everything and switch on.", partIds: [], slots: [steps("8", 1, "Switch on", "Final checks, then connect the battery.")] },
    { id: "9", goal: "Load the code and test.", partIds: [], slots: [steps("9", 1, "Load the code", "Copy the kit's pi folder to the Pi, run selftest.py with the wheels off the ground, then main.py.")] },
    { id: "10", goal: "Fix common problems.", partIds: [], slots: [{ id: "10.1", kind: "fix", title: "When something is wrong", hint: "Symptoms a builder of THIS robot would see, with advice and a pointer to the page that fixes it.", panels: 0 }] },
    { id: "S", goal: "Short how-to pages other books point to.", partIds: [], slots: SKILLS },
  );
  return plans;
}

/* ---------- Writers: one Gemini call per book ---------- */

const WriterOut = z.object({
  manualTitle: z.string().optional(),
  subtitle: z.string().optional(),
  note: z.string().optional(),
  also: z.string().optional(),
  tools: z.string().optional(),
  pages: z.array(z.object({
    slot: z.string(),
    title: z.string().optional(),
    blurb: z.string().optional(),
    warning: z.string().optional(),
    footer: z.string().optional(),
    panels: z.array(z.object({ title: z.string(), caption: z.string().optional(), partId: z.string().optional(), icon: z.string().optional() })).optional(),
    rows: z.array(z.object({ symptom: z.string(), advice: z.string(), see: z.array(z.string()).optional() })).optional(),
    see: z.array(z.string()).optional(),
  })),
});
type Written = z.infer<typeof WriterOut>;

function writerSchema(slotIds: string[], partIds: string[], allSlots: string[]) {
  const see = { type: "array", items: { type: "string", enum: allSlots }, description: "Slot ids of pages that teach a skill or part needed here. Max 3." };
  const part = partIds.length ? { type: "string", enum: partIds, description: "Part this panel shows, if any." } : { type: "string" };
  return {
    type: "object",
    properties: {
      manualTitle: { type: "string", description: "Book 0 only: a short name for the manual, like 'Plant waterer'." },
      subtitle: { type: "string", description: "Book 0 only: one sentence." },
      note: { type: "string", description: "Book 0 only: how the books fit together." },
      also: { type: "string", description: "Book 0 only: small items to gather that are not in the buy list." },
      tools: { type: "string", description: "Book 0 only: tools to have." },
      pages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "string", enum: slotIds },
            title: { type: "string", description: "Max 40 characters." },
            blurb: { type: "string", description: "One short sentence." },
            warning: { type: "string", description: "Only if a real hazard exists. Max 70 characters." },
            footer: { type: "string" },
            panels: { type: "array", items: { type: "object", properties: { title: { type: "string" }, caption: { type: "string" }, partId: part, icon: { type: "string", enum: IconName.options, description: "Drawing for steps that show no part." } }, required: ["title"] } },
            rows: { type: "array", items: { type: "object", properties: { symptom: { type: "string" }, advice: { type: "string" }, see: see }, required: ["symptom", "advice"] } },
            see,
          },
          required: ["slot", "title", "blurb"],
        },
      },
    },
    required: ["pages"],
  };
}

async function writeBook(plan: Plan, design: Design, catalog: Part[], allSlots: string[], designParts: Part[]): Promise<Written> {
  const parts = plan.partIds.map((id) => catalog.find((p) => p.id === id)!).filter(Boolean);
  const slots = plan.slots.map((s) => `- ${s.id} (${s.kind}${s.panels ? `, ${s.panels} panels` : ""}): "${s.title}". ${s.hint}${s.wires ? ` Wires are drawn by code: ${s.wires.map((w) => `${w.from} to ${w.to}`).join("; ") || "none"}.` : ""}${s.gauge ? ` Gauge shown: ${s.gauge.reading}.` : ""}`).join("\n");
  const system = `You write one book of a beginner's assembly manual for ONE specific robot: ${design.summary}
Book "${bookName(plan.id)}": ${plan.goal}
Rules: plain, friendly, short sentences for a first-time builder. Describe only what the facts below support. Never invent part specs, pin numbers, voltages or wire colours: code draws wires and pins, so refer to them without restating numbers. Do not mention prices. Warnings only for real hazards (batteries, short circuits, hot parts, cutting). Panels are numbered steps left to right. For a fix page, give 3 to 5 symptoms this robot's builder would really see.
Pages to write (use exactly these slot ids):
${slots}

Parts for this book:
${catalogLines(parts) || "(none specific)"}
${parts.map((p) => (p.notes ? `Note on ${p.name}: ${p.notes}` : "")).filter(Boolean).join("\n")}
All parts in the robot (for context):
${designParts.map((p) => `- ${shortName(p)}`).join("\n")}`;
  return ask(WriterOut, writerSchema(plan.slots.map((s) => s.id), plan.partIds, allSlots), system, `Write the "${bookName(plan.id)}" book now.`);
}

/* ---------- Assembly ---------- */

/** `offline` (no Gemini key, or demo mode): code writes the whole manual from slot hints, with part drawings in place of photos. */
export async function generateManuals(design: Design, derived: Derived, catalog: Part[], say: Say = () => {}, offline = false): Promise<ManualSetT> {
  const r = resolveParts(design, catalog);
  const designParts = [...new Map(r.parts.map((p) => [p.id, p])).values()];
  const qty = (id: string) => design.partIds.filter((i) => i === id).length;
  const plans = planBooks(design, derived, catalog);
  const allSlots = plans.flatMap((p) => p.slots.map((s) => s.id));
  say(`Manual planner: laying out ${plans.length} books for your robot…`);

  const photos = offline ? Promise.resolve({} as Record<string, PartImage>) : findPartImages(designParts, say).catch((): Record<string, PartImage> => ({}));
  const written = await Promise.all(plans.map(async (plan) => {
    if (offline) return undefined;
    say(`Writer agent (${bookName(plan.id)}): writing the pages…`);
    try {
      const out = await writeBook(plan, design, catalog, allSlots, designParts);
      say(`Writer agent (${bookName(plan.id)}): done.`);
      return out;
    } catch (e) {
      console.warn(`[manual] writer ${plan.id} failed`, e);
      say(`Writer agent (${bookName(plan.id)}): failed, using plain page text.`);
      return undefined;
    }
  }));
  const images = await photos;
  if (!offline) say(`Photo agents: ${Object.keys(images).length} of ${designParts.length} parts have a verified photo.`);

  const w0 = written[0];
  const titleOf = new Map(plans.flatMap((p) => p.slots.map((s) => [s.id, clip(written[plans.indexOf(p)]?.pages.find((w) => w.slot === s.id)?.title, 40) || s.title] as const)));
  const seeRefs = (labels: string[] | undefined, self: string) =>
    (labels ?? []).filter((l) => l !== self && allSlots.includes(l)).slice(0, 3).map((l) => ({ book: l.split(".")[0] as BookIdT, page: Number(l.split(".")[1]), label: clip(titleOf.get(l), 60) }));
  // A verified photo when there is one, otherwise a drawing of the part, so no slot is left empty.
  const art = (partId?: string) => {
    if (!partId) return undefined;
    const img = images[partId];
    return img ? { kind: "photo" as const, src: img.src, credit: img.credit } : { kind: "part" as const, partId };
  };
  const icon = (name?: string, fallback: IconNameT = "tools") => ({ kind: "icon" as const, name: IconName.safeParse(name).data ?? fallback });
  const box = (partIds: string[]) => partIds.slice(0, 6).map((id) => ({ qty: Math.max(1, qty(id)), label: shortName(catalog.find((p) => p.id === id)!), art: art(id) }));
  const allWires = plans.flatMap((p) => p.slots.flatMap((s) => s.wires ?? []));

  const pages = new Map<string, ManualPageT>();
  plans.forEach((plan, pi) => {
    plan.slots.forEach((slot, si) => {
      const w = written[pi]?.pages.find((x) => x.slot === slot.id);
      const base = { book: plan.id, page: si + 1, title: titleOf.get(slot.id)!, blurb: clip(w?.blurb, 160) || clip(slot.hint, 160), warning: clip(w?.warning, 80) || undefined, parts: slot.kind === "steps" || slot.kind === "wiring" ? box(plan.partIds) : [], see: seeRefs(w?.see, slot.id) };
      const panels = (w?.panels ?? []).slice(0, slot.panels || 3).map((p) => ({ title: clip(p.title, 40), caption: clip(p.caption, 200) || undefined, art: p.partId && plan.partIds.includes(p.partId) ? art(p.partId) : icon(p.icon, SLOT_ICON[slot.id]) }));
      const fallbackPanels = [{ title: slot.title, caption: clip(slot.hint, 200), art: art(plan.partIds[0]) ?? icon(undefined, SLOT_ICON[slot.id]) }];
      let page: ManualPageT;
      if (slot.kind === "steps") page = { ...base, kind: "steps", panels: panels.length ? panels : fallbackPanels, footer: clip(w?.footer, 120) || undefined };
      else if (slot.kind === "skill") page = { ...base, kind: "skill", panels: panels.length ? panels : fallbackPanels };
      else if (slot.kind === "wiring") {
        const photo = plan.partIds.map((id) => images[id]).find(Boolean);
        page = { ...base, kind: "wiring", wires: (slot.wires ?? []).slice(0, 24), gauge: slot.gauge, ...(photo ? { photo: { src: photo.src, credit: photo.credit, pin1Marker: false } } : {}) };
      } else if (slot.kind === "fix") {
        const rows = (w?.rows ?? []).slice(0, 7).map((x) => ({ symptom: clip(x.symptom, 50), advice: clip(x.advice, 200), see: seeRefs(x.see, slot.id) }));
        page = { ...base, kind: "fix", rows: rows.length ? rows : [{ symptom: "Nothing happens", advice: "Check the battery is charged and every connection is firm.", see: [] }] };
      } else if (slot.kind === "parts") {
        const counts = COLORS.concat(["red", "black"]).map((color) => ({ color, count: allWires.filter((x) => x.color === color).length })).filter((c) => c.count > 0);
        page = { ...base, kind: "parts", items: designParts.slice(0, 16).map((p) => ({ qty: Math.max(1, qty(p.id)), label: shortName(p), art: art(p.id) })), also: clip(w0?.also, 300), tools: clip(w0?.tools, 200), wireCounts: counts };
      } else if (slot.kind === "legend") page = { ...base, kind: "legend", title: "How to read these books", blurb: "Five things to know before page one." };
      else page = { ...base, kind: "shelf", note: clip(w0?.note, 300) || "Build the robot one book at a time, in number order." };
      pages.set(slot.id, page);
    });
  });

  if (!offline) await factCheck(pages, design, designParts, allWires, say);

  const set = ManualSet.parse({
    title: clip(w0?.manualTitle, 80) || clip(design.summary, 80),
    subtitle: `${clip(w0?.subtitle, 150) || (offline ? "Built from your parts list, without Gemini." : "Written for your robot.")} The build kit is untested on hardware.`, // honest label is added by code, not the model
    source: offline ? "template" : "gemini",
    books: plans.map((plan) => ({ id: plan.id, name: bookName(plan.id), pages: plan.slots.map((s) => pages.get(s.id)!) })),
  });
  return set;
}

/* ---------- Fact-checker ---------- */

const FactOut = z.object({ fixes: z.array(z.object({ key: z.string(), corrected: z.string() })) });

async function factCheck(pages: Map<string, ManualPageT>, design: Design, parts: Part[], wires: Wire[], say: Say) {
  const claims = new Map<string, { text: string; set: (t: string) => void; max: number }>();
  for (const [id, pg] of pages) {
    claims.set(`${id}|blurb`, { text: pg.blurb, set: (t) => (pg.blurb = t), max: 160 });
    if (pg.warning) claims.set(`${id}|warning`, { text: pg.warning, set: (t) => (pg.warning = t), max: 80 });
    if (pg.kind === "steps" || pg.kind === "skill") pg.panels.forEach((pn, i) => pn.caption && claims.set(`${id}|panel${i}`, { text: pn.caption, set: (t) => (pn.caption = t), max: 200 }));
    if (pg.kind === "steps" && pg.footer) claims.set(`${id}|footer`, { text: pg.footer, set: (t) => (pg.footer = t), max: 120 });
    if (pg.kind === "fix") pg.rows.forEach((row, i) => claims.set(`${id}|row${i}`, { text: row.advice, set: (t) => (row.advice = t), max: 200 }));
  }
  say("Fact-checker: comparing every manual sentence with the part data…");
  try {
    const evidence = parts.map((p) => `${catalogLines([p])}${p.notes ? ` | notes: ${p.notes}` : ""}`).join("\n");
    const out = await ask(
      FactOut,
      { type: "object", properties: { fixes: { type: "array", items: { type: "object", properties: { key: { type: "string" }, corrected: { type: "string" } }, required: ["key", "corrected"] } } }, required: ["fixes"] },
      `You are the Fact-checker for an assembly manual. Flag a sentence ONLY if it states a number, voltage, pin, wire colour, part spec or part that the data contradicts or lacks, or gives advice that could damage the robot or hurt the builder. General beginner technique (how to strip a wire, how to use a multimeter) is fine. Return a one-sentence corrected replacement per flagged key, using only the data. An empty list means all supported.`,
      `Robot: ${design.summary}\nPart data:\n${evidence}\nWires drawn by code: ${wires.map((w) => `${w.from} to ${w.to}`).join("; ") || "none"}\n\nSentences:\n${[...claims].map(([k, c]) => `${k}: ${c.text}`).join("\n")}`,
    );
    const fixes = out.fixes.filter((f) => claims.has(f.key) && f.corrected.trim());
    for (const f of fixes) {
      const c = claims.get(f.key)!;
      c.set(clip(f.corrected, c.max));
    }
    say(fixes.length ? `Fact-checker: corrected ${fixes.length} sentence${fixes.length > 1 ? "s" : ""}.` : "Fact-checker: every sentence is supported.");
  } catch (e) {
    console.warn("[manual fact-checker] skipped", e);
    say("Fact-checker unavailable; keeping the written text.");
  }
}

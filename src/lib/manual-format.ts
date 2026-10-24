// Format of the build manuals ("books"), taken from the Paper pages "Book 0" to "Book S".
// Gemini writes the WORDS (titles, blurbs, captions, step text, symptoms, advice). Code supplies everything checkable
// (part list, pins, wire colours, counts) from the design and derive.pinMap, and draws the page.
// Canvas in Paper: 1400 x 1280 SVG on #FBF8F3 paper. The viewer renders the same layout in HTML.
import { z } from "zod";

export const BOOKS = [
  { id: "0", name: "Start here", color: "#7B7F73" },
  { id: "1", name: "Chassis", color: "#E8813A" },
  { id: "2", name: "Brain", color: "#4179C7" },
  { id: "3", name: "Power", color: "#D94F41" },
  { id: "4", name: "Drive", color: "#C99A12" },
  { id: "5", name: "Arm", color: "#8B5BB8" },
  { id: "6", name: "Eyes", color: "#3E9E63" },
  { id: "7", name: "Water", color: "#2F9DB3" },
  { id: "8", name: "Switch on", color: "#B0382C" },
  { id: "9", name: "Code", color: "#475049" },
  { id: "10", name: "Fix it", color: "#774A28" },
  { id: "S", name: "Skills", color: "#759075" },
] as const;

export const BookId = z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "S"]);
export type BookIdT = z.infer<typeof BookId>;

export const WireColor = z.enum(["red", "black", "orange", "blue", "yellow", "white", "green", "purple", "brown", "grey"]);

/** A "SEE" tag: points at the page of another book that teaches a skill. Coloured with the target book's colour. */
export const SeeRef = z.object({ book: BookId, page: z.number().int().min(1), label: z.string().max(60) });

// https or a local /path only, so a model-written URL cannot point at a random tracker.
const Src = z.string().regex(/^(https:\/\/|\/(?![\/\\]))/);

/** Art slot. Photos need a licence that allows reuse and a credit line (e.g. CC BY) shown on the page. */
export const Art = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("photo"), src: Src, credit: z.string().optional() }),
  z.object({ kind: z.literal("part"), partId: z.string() }),
]);

/** One slot in the parts box at the top of a page: exactly what this page needs. */
export const PartsBoxItem = z.object({ qty: z.number().int().min(1), label: z.string().max(40), art: Art.optional() });

/** One wire. Code fills pins from the checked pin map; Gemini must not invent them. isNew wires glow, older ones fade. */
export const Wire = z.object({ color: WireColor, from: z.string(), to: z.string(), isNew: z.boolean().default(true) });

export const Panel = z.object({ title: z.string().max(40), art: Art.optional(), caption: z.string().max(200).optional() });

const Base = z.object({
  book: BookId,
  page: z.number().int().min(1),           // 1-based inside the book
  title: z.string().max(60),               // shown under the art, big
  blurb: z.string().max(160),              // one short sentence under the title
  warning: z.string().max(80).optional(),  // red triangle, e.g. "Battery stays unplugged"
  parts: z.array(PartsBoxItem).max(6).default([]),
  see: z.array(SeeRef).max(3).default([]),
});

export const ManualPage = z.discriminatedUnion("kind", [
  // 0.1 shelf: the spines of all books and a note on how they fit together
  Base.extend({ kind: z.literal("shelf"), note: z.string().max(300) }),
  // 0.2 parts and tools checklist
  Base.extend({
    kind: z.literal("parts"),
    items: z.array(PartsBoxItem).max(16),
    also: z.string().max(300),
    tools: z.string().max(200),
    wireCounts: z.array(z.object({ color: WireColor, count: z.number().int().min(0) })),
  }),
  // 0.3 how to read these books: the legend (fixed content, drawn by code)
  Base.extend({ kind: z.literal("legend") }),
  // build pages with 1 to 3 numbered panels left to right (Chassis, Brain, Arm, Water, ...)
  Base.extend({ kind: z.literal("steps"), panels: z.array(Panel).min(1).max(3), footer: z.string().max(120).optional(), photoCredit: z.string().optional() }),
  // wiring pages: blocks and wires drawn over a photo of the board, plus the wire list. gauge is for meter readings.
  Base.extend({
    kind: z.literal("wiring"),
    photo: z.object({ src: Src, credit: z.string().optional(), pin1Marker: z.boolean().default(true) }).optional(),
    wires: z.array(Wire).max(24),
    gauge: z.object({ reading: z.string().max(12), expect: z.string().max(40) }).optional(),
  }),
  // Fix it: one row per symptom, advice, and SEE tags to the pages that cure it
  Base.extend({ kind: z.literal("fix"), rows: z.array(z.object({ symptom: z.string().max(50), advice: z.string().max(200), see: z.array(SeeRef).max(3) })).min(1).max(7) }),
  // Skills: a small how-to with 1 to 3 panels, linked from SEE tags
  Base.extend({ kind: z.literal("skill"), panels: z.array(Panel).min(1).max(3) }),
]);
export type ManualPageT = z.infer<typeof ManualPage>;

export const Book = z.object({ id: BookId, name: z.string(), pages: z.array(ManualPage).min(1) });

export const ManualSet = z.object({
  title: z.string().max(80),               // "Plant waterer"
  subtitle: z.string().max(200),
  source: z.enum(["sample", "gemini", "template"]),
  books: z.array(Book),
});
export type ManualSetT = z.infer<typeof ManualSet>;

export const bookMeta = (id: BookIdT) => BOOKS.find((b) => b.id === id)!;

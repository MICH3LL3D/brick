# Brief 7: Build manuals (Build mode)

Owner: A (UX/frontend) for the viewer. B for the generator.

## What this is

Build mode is a second mode next to Design (switch in the top bar). It shows the robot's build manuals as a shelf of 12 books and 37 pages, with a Sprocket chat panel that knows which page the reader is on.

The page formats are fixed in `src/lib/manual-format.ts` (zod schema). `src/lib/manual-sample.ts` holds hand-written sample content so the viewer works today.

## Who writes what

- **Gemini writes the words**: page titles, blurbs, step captions, fix-it advice, warnings, and which SEE tags to attach. It writes these for the specific design.
- **Code supplies everything that can be checked**: pin numbers, wire colours, parts counts, voltage readings. These come from `derive.pinMap` and the catalog, never from the model. The generator fills `wires`, `parts` and `gauge` in code after Gemini returns, and rejects a set whose SEE tags point at pages that do not exist.
- **Gemini does not draw.** Art slots take a catalog part id or a licensed photo. Wire diagrams over board photos are rendered by code from the wire list. Until that exists the viewer shows a labelled placeholder.

## Books

| id | name | pages | notes |
|----|------|-------|-------|
| 0 | Start here | 3 | shelf, parts, legend |
| 1 | Chassis | 3 | steps |
| 2 | Brain | 3 | steps |
| 3 | Power | 4 | wiring and a voltage check (battery stays unplugged until Book 8) |
| 4 | Drive | 4 | wiring |
| 5 | Arm | 3 | wiring |
| 6 | Eyes | 3 | wiring |
| 7 | Water | 3 | wiring |
| 8 | Switch on | 1 | steps |
| 9 | Code | 2 | steps |
| 10 | Fix it | 2 | symptom, advice, SEE tags |
| S | Skills | 6 | short how-to pages other books point to with SEE tags |

Page counts come from the design: a robot with no arm gets no arm book content. The sample set uses the full 37.

## Page kinds

`shelf`, `parts`, `legend`, `steps`, `wiring`, `fix`, `skill`. Every page also has `book`, `page`, `title`, `blurb`, an optional `warning`, a parts box (`parts`), and `see` tags. Canvas size in Paper is 1400x1280 on #FBF8F3.

## Viewer behaviour

- A SEE tag to a Skills page opens it with a "Back to Book N" return, and the list marks where the reader came from.
- Progress (pages marked done) is kept in the browser only (`localStorage`).
- Sprocket uses `POST /api/chat`. The server has no page-context field yet, so the viewer prefixes the last message with `[Reader is on Book 3, page 2]`.

## Open for B

1. ~~`POST /api/manual`~~ Built: see "Manual generator" below.
2. A `page` context field on `/api/chat`, and an `open_page {book, page}` action so Sprocket can jump the reader to a page.
3. Older v1 "Build manual" pages (00 to 13) in Paper are superseded by this layout.

## Manual generator (built)

`POST /api/manual { design, task, stream? }` returns a `ManualSet` with `source: "gemini"` (code in `src/lib/manuals/build.ts`). With `stream: true` it sends NDJSON progress lines like `/api/generate`. Without a Gemini key, or in `DEMO_MODE`, it answers 503 and the viewer keeps the sample set. The viewer shows the sample at once and swaps in the generated set when it arrives, with a status line while it works.

- **Code decides** which books and pages exist (no arm: no Arm book; no sensors: no Eyes; no pump or tank: no Water), the parts boxes and quantities, the wires (from `derive.pinMap`, with pin roles from `labelPins`), the power wiring, the 5 V gauge, SEE links, and the Skills slots. A design gets about 18 pages, not the 37 of the sample.
- **Writer agents** (Gemini, one per book, in parallel) write titles, blurbs, step captions, warnings and the Fix it symptoms. They name which part a panel shows; code attaches that part's photo.
- **Fact-checker agent** compares every sentence with the catalog data and rewrites unsupported ones.
- **Photo agents** (brief 8) find and verify product photos for the design's parts. Parts with no verified photo keep the grey placeholder.
- If one writer fails, its pages fall back to plain text from the slot hints. If the whole route fails, the sample set is shown.
- **Wire diagrams** (`components/WiringDiagram.tsx`, from the Paper pages "04 Driver signals" and "05 Battery power"): a "wires needed" strip, the devices with labelled ports on the left, the Pi's 40-pin header on the right (drawn by code, pin 1 marked, used pins numbered), curved coloured wires, and one numbered step per wire ("Connect Pi pin 11 (GPIO17) to Ultrasonic Distance Sensor TRIG with the orange wire."). The stepper starts with every wire shown; Next wire draws one at a time, the current wire glows and earlier ones fade. Wires carry structured ends (`a`, `b` with a physical `pin`), taken from `derive.pinMap` and the BCM-to-pin table in `src/lib/pi-header.ts`, so Gemini never places a wire. Pages without structured ends (the sample set) fall back to the plain wire list.
- The diagram draws the Pi header itself instead of a photo of the board, so wire ends are exact. Motor leads to the driver are not drawn (driver terminals differ by board).
- **No empty art slots.** Every parts-box item, parts-page item and step panel gets art. Order: a verified product photo of the part; otherwise a drawing of the part's kind (`src/lib/part-kind.ts`, `components/PartArt.tsx`: chassis, Pi board, driver, arm, pump, tank, ultrasonic sensor, camera, battery, regulator, board); steps that show no part get a drawn action icon (SD card, Wi-Fi, laptop, terminal, multimeter, wire, ...) chosen by the writer or a per-slot default. Drawings carry a small caption ("Drawing, not a photo of your exact part"). Art kinds are `photo`, `part` and `icon` in `manual-format.ts`.
- Not done: pin-1 marker on a board photo, per-step diagrams for non-wiring pages.

## Not built yet

Diagram art (wires drawn over board photos), photo attach in chat, "Opens:" tags in chat replies.

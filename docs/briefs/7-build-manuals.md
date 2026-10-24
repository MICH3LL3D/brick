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

1. `POST /api/manual` with `{ design, task }`, returning a `ManualSet` (`source: "gemini"`, or `"template"` when Gemini is down). The viewer calls it now and falls back to the sample set when the route is missing.
2. A `page` context field on `/api/chat`, and an `open_page {book, page}` action so Sprocket can jump the reader to a page.
3. Older v1 "Build manual" pages (00 to 13) in Paper are superseded by this layout.

## Not built yet

Diagram art, photo attach in chat, "Opens:" tags in chat replies, per-page content for books 1, 3 to 9 beyond the samples.

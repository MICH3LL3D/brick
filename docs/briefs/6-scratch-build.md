# Brief 6: Scratch-build mode (spec for B)

Status: spec only. A has not built any of this. B owns the integration, including Gemini.

Read first: docs/DECISIONS.md, src/lib/contracts.ts, docs/briefs/1-gemini-pipeline.md, docs/briefs/2-catalog.md.

## Why
Today every design starts from a bought chassis kit (`chassis-*` in `data/catalog.json`). A user may want to build the base themselves from cheap materials (plywood, acrylic, cardboard) and separate motors and wheels. Everything they would need to buy must show up in the cart. Nothing is assumed to be owned.

## What the user sees
- Gemini may return either a kit chassis or a scratch base. Which one is its call, based on payload, budget and the task.
- The cart lists every sheet, motor, wheel, caster and fastener as its own item, plus the tools in `data/supplies.json`.
- The kit manual (`manual.html`) gains a "Build the base" section: what to cut, where to drill, how to mount the motors, wheels and caster.

## Contract changes (both owners agree first, per PLAN section 3)
Add two values to `PartCategory`:
- `structure`: sheet stock and fasteners. Caps: `maxPayloadG` (what a base made from one sheet carries), `material` ("plywood" | "acrylic" | "cardboard", new optional enum), `thicknessMm` (new optional number). Fasteners and adhesives are `structure` with no caps.
- `drivetrain`: gearmotors, wheels, casters. Caps: `wheels` (count the part supplies), `speedMps` and `wheelDiameterMm` as on chassis, `maxCurrentA` and `drawW` for motors. Use `mounts: ["drive"]` or `["caster"]` for the slot.

Do not use `chassis` for scratch parts. `chassis` keeps meaning "bought base".

## Catalog (data/catalog.json, B)
Add real, priced, linked parts. Everything starts `verified:false`.
- Sheets: 3 mm plywood, 3 mm acrylic, corrugated cardboard (mock-ups only; payload caps must be low enough that checks fail a real design).
- Drivetrain: 2 gearmotor options (TT yellow motor, N20 with encoder), 2 wheel sizes, 1 ball caster.
- Fasteners: M3 screw, nut and standoff kit; motor brackets.
- Notes carry the gotchas (motor stall current, caster height must match wheel radius, cardboard flexes under a full water tank).

## Checks (src/lib/derive.ts, B)
- Structure check passes with exactly one base: either one `chassis`, or one `structure` sheet plus at least 2 drive wheels from `drivetrain`, matching motors, and one caster.
- Payload: for a scratch base, use the sheet's `maxPayloadG` instead of the chassis value.
- Motor channels: count scratch motors the same way kit chassis motors are counted today (2 per base).
- Footprint and height: take them from the sheet dims. Tool top uses sheet thickness plus wheel radius.
- Failure messages stay plain English and are fed back to Gemini.

## Gemini (src/lib/generate.ts, B)
- Prompt rules: "Exactly one base: a kit chassis, or a scratch base made of one sheet, 2+ drive wheels with motors, and a caster." Keep catalog-id-only enforcement and the repair loop.
- Default to a kit chassis unless the user asks to build it themselves or the budget cannot fit one. A flag on the request (`buildFromScratch?: boolean`) can force scratch mode; A will add a toggle to the prompt bar once that flag exists.

## Kit manual (src/lib/kit/, B)
- New section generated from the chosen sheet and drivetrain: cut list with dimensions from the footprint, drill points for motors and caster, assembly order, a safety note for cutting and soldering.
- Tools needed come from `data/supplies.json`. Add these to it when this ships: hobby saw or craft knife, hand drill with bits, sandpaper, steel ruler, hot glue gun.

## What A does after B lands this
- `RobotPreview` draws a sheet with wheels and a caster for scratch bases (today only kit chassis are drawn).
- Prompt bar toggle for `buildFromScratch`.
- Cart groups the items: Parts, Build materials, Tools and supplies.

## Done when
A scratch design for "water my plants" passes the checks, every sheet, motor, wheel, caster and fastener appears in the cart, and the downloaded kit contains a build section whose cut list matches the footprint.

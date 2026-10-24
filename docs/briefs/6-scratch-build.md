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

## Candidate parts for the catalog (researched by A, all unverified)
Real listings, cheapest first. Prices are list prices seen at lookup time and may have changed. B should verify before setting `verified:true`.

| Part | Category | Vendor | Price | Link |
|---|---|---|---|---|
| TT gearbox motor, 200 RPM, 3-6 V | drivetrain | Adafruit | $2.95 | https://www.adafruit.com/product/3777 |
| TT motor, bi-metal gearbox, 1:90 | drivetrain | Adafruit | $4.50 | https://www.adafruit.com/product/3801 |
| Thin white wheel for TT motors, 65 mm | drivetrain | Adafruit | $1.50 | https://www.adafruit.com/product/3763 |
| Black multi-hub wheel for TT / N20, 65 mm | drivetrain | Adafruit | $1.95 | https://www.adafruit.com/product/4205 |
| Pololu ball caster, 3/8 in plastic ball | drivetrain | Pololu | $2.95 | https://www.pololu.com/product/950 |
| Pololu wheel 60x8 mm pair (3 mm D shaft) | drivetrain | Pololu | $6.75 | https://www.pololu.com/product/1420 |
| Micro metal gearmotor 30:1 MP 6 V (pricier, metal gears) | drivetrain | Pololu | $23.95 | https://www.pololu.com/product/2364 |
| Basswood plywood 12x12x1/8 in (3 mm), 12 pack | structure | Walmart (LotFancy) | $18.99 | https://www.walmart.com/ip/LotFancy-Basswood-Sheets-12-Pack-12-x-12-x-1-8-in-Plywood-Sheets-3-mm-Square-Craft-Wood-Board/5129756459 |
| Clear cast acrylic 12x12x1/8 in, 1 sheet | structure | Estreet Plastics | $3.79 | https://www.estreetplastics.com/1-8-x-12-x-12-Clear-Acrylic-Plexiglass-Sheet-p/1001251212.htm |

Notes for B:
- TT motors and the 65 mm TT wheels are the cheapest working pair (about $4.45 per driven wheel). The Pololu 60 mm wheels need Pololu micro metal gearmotors, not TT motors.
- Check basswood thickness: some listings are 1/16 in, not 1/8 in.
- No priced cardboard listing was found. Corrugated cardboard is a mock-up material only; B may use a generic entry with a low `maxPayloadG`.
- A listing for the M3 fastener kit is not added yet; `sup-standoffs` in `data/supplies.json` is the M2.5 nylon set.

# Brief 3: Deterministic checks, derived values, simulation, 3D preview

Read first: docs/DECISIONS.md, src/lib/contracts.ts.

## Build (no Gemini calls anywhere in this brief)
- src/lib/derive.ts: `deriveAndCheck(design, task, room, catalog)` -> `Derived` (+ checks). Checks, each with a plain-English message:
  - exactly one controller, one chassis, one power source; at least one motor driver if the chassis has motors
  - pin budget (parts' `pins` vs Pi GPIO available), PWM needs a servo board
  - power: total average draw vs battery Wh and max current
  - payload: carried mass vs chassis and arm payload
  - reach: for every target the routine acts on, the arm (min..max reach, lift height) can get the tool to target heightMm from a reachable floor spot
  - tank: water needed vs tank size for water actions
  - doorway: footprint width fits doorways on the path
- src/lib/sim.ts: `simulate(design, task, room, catalog)` -> `SimResult`.
  - Grid A* path planning (50 mm cells, inflate obstacles by half the footprint). Visit targets in listed order, approach to within arm reach, perform the action, apply battery use, return home.
  - Mark an event failed with a reason when reach, payload, tank, battery or path fails. Success = all events ok.
- src/lib/rebudget.ts: `rebudget(design, budgetUsd, task, room, catalog)` deterministic. Start from cheapest valid parts per category, then upgrade the part with best gain per dollar until budget is spent. Gain = more targets succeeding, then battery margin. Return design + derived + sim. Must run in well under 100 ms so the slider feels live.
- components/RobotPreview.tsx: react-three-fiber. Build the robot from boxes and cylinders sized from catalog dims. Show wheels, deck, arm (animate extend/retract from reach min..max), tank. Orbit controls.
- components/SimView.tsx: top-down room (obstacles, doorways, targets) with the robot moving along `path`, event markers (green ok, red failed with the reason), play/pause/scrub.
- Unit tests for checks and sim using 3 hand-built designs: a cheap one that fails the high shelf, a mid one that passes, a too-wide one that fails the narrow doorway.

## Done when
The three test designs produce the expected pass/fail, and rebudget visibly changes the design across a $50-$500 slider range.

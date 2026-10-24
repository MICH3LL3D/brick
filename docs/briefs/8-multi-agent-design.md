# Brief 8: Multi-agent robot design (spec for B)

Status: built (`src/lib/agents/`, `src/lib/images/`). B owns it (Gemini). Simulation is out of scope here and stays as it is. Where the code differs from the first draft of this brief, this text now describes the code.

Read first: docs/PLAN.md, docs/DECISIONS.md, src/lib/contracts.ts, docs/briefs/1-gemini-pipeline.md.

## Where we are today

The UI already calls `/api/generate`, which runs `generateDesign` in `src/lib/generate.ts`: one Gemini call picks every part, code checks it (`derive.ts`), and failures go back to Gemini for up to 2 repairs. This works, but one prompt must reason about mobility, arm, tool, sensors, power and wiring at once. That is where the repair rounds come from.

## Goal

Replace the single call with a small team: an interpreter, one specialist per part of the robot, and a master that combines the pieces. Output stays the existing `Design` plus `Task`, so no contract change, and the UI, chat, kit and cart need no change.

## The team

```
user prompt + budget
      |
 [0] Interpreter (Gemini)  ->  TaskBrief
      |
 [1] Wave 1, parallel:   Mobility   Manipulation   Sensing
      |
 [2] Wave 2, parallel:   Power & Brain   Routine
      |
 [3] Budgeter (code)     picks one option per specialist under the budget
      |
 [4] Master (Gemini)     checks fit between parts, writes summary, fixes conflicts
      |
 [4b] Fact-checker       rewrites any reason or summary claim the catalog data does not support
      |
 [5] derive.ts checks    failures route back to the owning specialist (max 2 rounds)
      |
   Design + Task
```

### 0. Interpreter
Reads the prompt and the room targets. Returns a `TaskBrief`:
- `targetIds` (from `room.targets`, in visit order), same meaning as today.
- Qualitative needs: acts on liquid, carries an object, needs vision, needs height, wants scratch build.
- A budget posture: `tight`, `normal` or `generous`, read from the prompt ("cheap", "nice") and the slider.

Code, not Gemini, then turns the targets into numbers: highest `heightMm` becomes required lift, farthest reach, object mass, water volume. Specialists receive these numbers as facts. Gemini never computes them (PLAN rule).

### 1. Specialists
Each is one Gemini call (all agents use `MODELS.GENERATE`; flash-lite was not used) with a narrow job and only its slice of the catalog. Enums lock ids to that slice, so a specialist cannot pick another specialist's parts.

| Specialist | Categories it may pick | Owns these checks |
|---|---|---|
| Mobility | `chassis` (and `structure`, `drivetrain` once brief 6 lands) | `structure`, `payload` |
| Manipulation | `arm`, `tool` | `reach`, `arm-payload`, `tools` |
| Sensing | `sensor` | `pin-budget` (sensor share) |
| Power & Brain | `controller`, `motor_driver`, `power`, `misc` | `motor-channels`, `pin-budget`, `pwm-board`, `power-supply`, `battery` |
| Routine | none (writes `routine` steps only) | `routine` |

Wave 2 exists because Power & Brain depends on wave 1: motor channels, pins and watts come from the chosen chassis, arm, tool and sensors. Code computes those loads and hands them to the specialist. Routine depends on the chosen tool (pump or gripper), so it runs in wave 2 too.

Each specialist returns **up to three options**, cheapest first: `{ partIds, reasons, tradeoff }`, where `tradeoff` is one sentence on what that option gives up or adds ("cheaper, but reach stops at 300 mm"). Every option must satisfy the specialist's own requirements; options differ in margin, quality and price.

### 3. Budgeter (code, no Gemini)
Prices are summed by code (`sumUsd`, in cents). It runs after wave 1 and picks among Mobility, Arm & tool and Sensing options, leaving a reserve for the Pi, motor driver and battery (cheapest of each; a rough figure). Power & brain always takes its cheapest option.
1. Start with every specialist's cheapest option.
2. If the total is over budget, that is the answer.
3. Otherwise spend the headroom on upgrades in a fixed order (mobility, arm & tool, sensing). `tight` upgrades nothing, `normal` upgrades at most one step per group, `generous` goes as far as the money allows.

### 4. Master (Gemini)
Receives the chosen options, the brief and the total. Does what no specialist can see:
- Cross-part fit: mounts and slots, the tool actually suits the sensors, no duplicate parts.
- May swap one option for another from the same specialist's list. Cannot add ids that no specialist returned (enum-locked to the union).
- Writes the one-sentence `summary` and merges `reasons`.
- Code then drops any part that is not in a chosen option and not part of a whole swapped-in option.

### 4b. Fact-checker (Gemini)
Sees every claim (the summary and each part's reason) next to the catalog data for the final parts. Flags a claim only if it states a number, capability or part the data contradicts or lacks, and returns a one-sentence replacement. Code applies the fixes to text only, never to part ids. If the call fails, the design continues with code checks only.

### 5. Checks and repair
`checkWithReasons` runs as today. Each failed check id maps to an owning specialist (table above; `pin-budget` goes to Power & brain). Only that specialist re-runs, with the failure text, then the Budgeter and Master run again. Max 2 repair rounds and the 60 s deadline stay as they are. Unmapped failures (`part-ids`, `reasons`) go to the Master. A `budget` failure goes to the priciest wave-1 specialist. If `budget` is the only failure, repair stops at once: specialists already offered their cheapest option, so the catalog cannot do it for less.

## Budget: aware, not a cage

- The slider value is the target, not a wall. The Budgeter always returns the cheapest feasible team. If even that exceeds the budget, the design is returned anyway with the `budget` check failing in plain English ("closest design is $X over"). That matches today's prompt rule and the "closest feasible design" wording.
- Specialists see the total budget and posture, not a per-specialist split, and are told not to output prices. Code does all money math.
- Upgrades happen only when they fit. Nothing is bought just to use up the budget.
- The slider after generation still uses `/api/rebudget` (deterministic, no Gemini), unchanged.

## Cost and latency

| | Today | Proposed |
|---|---|---|
| Gemini calls, no repair | 1 | 1 + 3 + 2 + 1 + 1 = 8 |
| Sequential stages | 1 | 5 (interpreter, wave 1, wave 2, master, fact-checker) |
| Model | `MODELS.GENERATE` | `MODELS.GENERATE` for every agent |

Measured 2026-10-24: "Water my plants" at $500 passed in one round in about 51 s (single call: about 43 s with a model fallback). Accepted by the team: anything under a few minutes is fine. Specialists in a wave run in parallel, so waves cost one call each. All calls go through `generateWithFallback` (hedging and fallback chain), with the same thinking level rules in `models.ts`. Token use per call drops because each specialist sees about a third of the catalog.

## Reliability

- On by default. `AGENTS=single` turns the team off and uses the single call.
- Any agent failure (timeout, invalid JSON after one retry) falls back to the existing `generateDesign`. The user never sees a half team.
- `DEMO_MODE=1` and the cache path in `app/api/generate/route.ts` are untouched.
- Specialists run with `Promise.allSettled`; one dead specialist triggers the fallback, not a partial design.

## Files (all B)

- `src/lib/agents/team.ts`: Interpreter, specialists, Master, Fact-checker, orchestration and repair routing. Exports `generateTeamDesign` with the same return type as `generateDesign`.
- `src/lib/agents/budgeter.ts`: option selection under budget. Has a unit test.
- `src/lib/generate.ts`: only change is exporting `catalogLines`.
- `src/lib/images/`, `app/api/part-images/route.ts`: see Product photos.
- `app/api/generate/route.ts`: use `generateTeamDesign` unless `AGENTS=single`, fall back on throw. With `stream: true` it replies as NDJSON (see Progress text).

No change to `contracts.ts`. Agent-internal types live in `src/lib/agents/`.

## Optional later

- Sensing and Manipulation as one agent if the demo prompts show they always agree.
- Real rate limiting per IP on `/api/generate` and `/api/part-images`. Today there are per-process caps (4 designs, 2 photo requests at once).

## Progress text (loading screen)

`POST /api/generate` with `stream: true` replies as NDJSON: `{"progress":"..."}` lines while the agents work, then one `{"result":{...}}` or `{"error":"...","status":n}` line. `generate()` in `src/lib/api.ts` reads it and `LoadingView` shows the latest lines ("Arm & tool agent: choosing the arm and tool…"). Without `stream`, the route replies with plain JSON as before. Cached or offline demo results send no progress, so `LoadingView` falls back to its generic steps.

## Product photos for the manuals

`POST /api/part-images { partIds, labels? }` returns `{ images, labels }`. Per part, in order:
1. Page agent (code): reads `og:image`, `twitter:image` or JSON-LD `image` from the vendor page.
2. Search agent (Gemini + Google Search): proposes image URLs and product pages when the vendor page gives none; the pages are read for images too (one search call serves both).
3. Verifier agent (Gemini vision): looks at each candidate and rejects wrong parts, bundles, logos and watermarked or tiny pictures. An unverified photo is never used.
Before the verifier, code checks the picture's pixel size from its file header (`src/lib/images/size.ts`): both sides at least 200 px and at most 8000 px, and a width to height ratio between 0.4 and 2.5. Tiny thumbnails, banners and unreadable files are skipped without a Gemini call.
4. Label agent (Gemini): maps parts-box labels ("Raspberry Pi 4") to catalog parts. Labels that name no part ("Your laptop") map to nothing.

Verified photos are saved to `public/part-images/` and indexed in `data/part-images.json`, so repeat and offline use needs no network. Misses are not retried for 10 minutes. Credit line is "Photo: <vendor>"; these are copies of vendor images, not licensed, so treat them as demo content. Safety: https only, port 443, public hosts, redirects re-checked, bodies size-capped, file names built from catalog ids. The Build view fills empty art slots after the pages appear (`attachPartImages`).

## Requested next: Realism agent (owner B, not built)

Some designs look wrong in 3D: for example a distance sensor placed somewhere it could not see forward. Add a Realism agent after the Master. It reviews the assembled robot for physical sense and returns, per part, a slot from that part's catalog `mounts` list (`front`, `deck`, `tool_mount`, ...). Rules to give it: distance and nose sensors face forward at the front edge and clear of the tank and arm; cameras sit high with an unblocked view; the pump sits low near the tank; batteries sit low and central; nothing overlaps the arm's swing. Code validates every slot against `mounts`, rejects overlaps, and retries once with the reason. Open point: carrying the slot in `Design` is a `contracts.ts` change, so both owners must agree first. The 3D scene (`components/robot3d/`) would then place parts by slot instead of by its own heuristics.

## Done when

The 3 demo prompts pass every check on the first assembly or after one routed repair, total time under 30 s, and forcing a specialist failure returns the single-call design.

## Open questions

1. Is a 2 to 3 times slower first design acceptable for the demo? If not, merge Sensing into Manipulation and skip the Interpreter's separate call by folding it into wave 1.
2. Should the Budgeter's upgrade ranking be fixed weights (simple, predictable) or asked of the Master (smarter, one more thing for Gemini to get wrong)? Recommendation: fixed weights.

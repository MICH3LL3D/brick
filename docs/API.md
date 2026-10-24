# API notes (owner B)

Routes owner B built, for owner A's UI. Shapes come from `src/lib/contracts.ts`. Fields marked *extra* are additions on top of the contract.

## POST /api/generate

Request: `{ prompt: string (1-500 chars), budgetUsd: number (50-500) }`

Response 200: `{ task, design, derived, sim, ok, attempts, repairNotes, source, cacheOrigin? }`

- `ok` *(extra)*: false means repairs ran out. Show the failed items in `derived.checks`; never hide them.
- `attempts` *(extra)*: 1-3. `repairNotes` *(extra)*: the failure text sent back to Gemini on each repair. Good for a "Sprocket fixed 2 problems" note.
- `source` *(extra)*: `"gemini"` or `"cache"`. `cacheOrigin` is `"gemini"` for recorded runs.
- Takes 5-50 s. Gemini was overloaded today, so the fallback models are often used. Show progress text.

Errors: 400 bad input, 502 Gemini failed (no cache for this prompt), 503 offline and not a demo prompt. The body is always `{ error }` in plain English.

Offline / `DEMO_MODE=1`: the 3 demo prompts are served from `data/cache/`. Matching is loose: case and punctuation are ignored. Checks and the sim are recomputed at the requested budget.

## POST /api/chat

Request: `{ messages: [{ role: "user" | "assistant", content }], design, task }`. Send the whole history; the last message must be from the user.

Response: `{ reply, actions: ChatAction[], source: "gemini" | "offline" }`

Apply `actions` in order:

- `set_budget { budgetUsd }`: move the slider, then call `/api/rebudget`.
- `swap_part { removeId, addId }`: replace the id in `design.partIds`. Ids are already validated as same-category catalog parts. Re-run checks via rebudget or derive.
- `regenerate { instruction }`: call `/api/generate` with `` `${task.prompt}. ${instruction}` ``.

If an action breaks a check, the reply already says so ("Heads up: ...").

## POST /api/kit

Request: `{ design, task }`. Response: `application/zip` (`robot-kit.zip`), or JSON `{ error, details? }` with status 500. Takes about 1-5 s.

## Shared code A can import

- `@/lib/data`: `loadCatalog()`, `loadRoom()`, and types `Room`, `Target`, `Task`, `Check`, `Derived`, `SimResult`. Room geometry conventions are documented at the top of the file.
- `@/lib/derive`: `deriveAndCheck()` plus helpers for `sim.ts` / `rebudget.ts` (`toolTopMm`, `horizontalReachMm`, `approachDistanceMm`, `actedTargets`, `resolveParts`, and constants such as `WATER_PER_PLANT_ML`). Using them keeps the sim and the checks in agreement.
- `@/lib/kit/buylist`: `buyRows()` and `buyListCsv()` for the buy list table and CSV button. Pure, safe on the client.

## Temporary

`src/lib/sim-stub.ts` is a straight-line stand-in for `sim.ts`. When `sim.ts` lands, change the three imports of `./sim-stub` (in `generate.ts`, `demo-cache.ts` and `kit/index.ts`) to `./sim`, then delete the stub.

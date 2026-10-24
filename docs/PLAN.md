# brick: Team Plan (hackathon, Sat 2026-10-24)

Source of truth for scope, ownership and timeline. Deadline **4:00 pm PT**. Track: **Best Use of Google Gemini**.
Product detail lives in `docs/DECISIONS.md` and `docs/briefs/`. Shared types live in `src/lib/contracts.ts`.

Two owners:

- **A (Michelle)**: user experience and frontend. Designs in Paper, builds the web UI.
- **B**: Gemini integration. Generation, chat, catalog scraping, and the checks that validate what Gemini returns.

## 1. Product

A **web app**. The user types a task in plain English ("water my plants"). Gemini designs one wheeled Raspberry Pi robot for it, using only real parts from a catalog. The app then shows:

1. The robot in 3D (orbit, arm extends and retracts).
2. A simulation of the robot doing the task in a sample apartment (top-down, A* path, green/red events).
3. A buy list with vendor links, prices, a reason per part, verified badges, CSV download.
4. A budget slider ($50-$500) that reshapes the design live, with no Gemini call.
5. A chatbot (placeholder name **Sprocket**) that explains choices and edits the design through function calls.
6. A build kit zip: buy list, wiring, Pi Python code, self-test, README, printable assembly manual.

The demo must survive bad wifi. Optimize for a reliable 3-minute demo, not production robustness.

Demo prompts: "Water my plants", "Bring my water bottle from the desk to the couch", "Patrol the apartment and take photos of the windows".

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Platform | Web app: Next.js + TypeScript, runs locally. |
| 3D | react-three-fiber + drei. |
| Gemini | `@google/genai`, server-side only. Model ids live only in `src/lib/models.ts`. Verify ids against ai.google.dev/gemini-api/docs/models before coding. |
| Robot type | Wheeled only (2 or 4 wheels). Fixed or extendable arms. No legs, no flying. |
| Who does what | Gemini picks parts and writes reasons. Code does all math, checks and simulation. |
| Parts | Gemini may only return catalog part ids. Invalid ids are rejected and retried (max 2 repairs, failures shown to the user). |
| Naming | Product name is brick. One constant string in one place (`src/lib/brand.ts`). Chatbot: Sprocket. |
| Frontend design | Designed in **Paper** first, then built. See section 7. |
| UI colors | Green (sage) buttons and fills always carry white/beige-white text and icons (`#FBF8F3`), never dark text. |
| Data | JSON files. No database. |
| Honest labels | Kit untested on hardware. Prices are from vendor pages at scrape time. LiDAR room scan is future work. Shopping agents are future work. |

## 3. Ownership (no overlap)

Every file has one owner. To change someone else's file: message them, or open a PR and tag them.

| Area | Owner | Files / folders |
|---|---|---|
| App shell, layout, prompt box, example chips, loading states | **A** | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/` (shell parts) |
| Budget slider UI, buy list UI, checks UI, limitations popover, chat panel UI | **A** | `components/` |
| 3D preview and simulation view | **A** | `components/RobotPreview.tsx`, `components/SimView.tsx` |
| Sim engine and rebudget (drive the slider and SimView, so they sit with the visuals) | **A** (after the UI slice lands, see section 5) | `src/lib/sim.ts`, `src/lib/rebudget.ts` |
| Paper designs, design tokens, copy and microcopy | **A** | Paper file, `app/globals.css` tokens |
| Gemini client, models, generate pipeline with repair loop | **B** | `src/lib/models.ts`, `src/lib/gemini.ts`, `src/lib/generate.ts`, `app/api/generate/` |
| Chat with function calling (set_budget, swap_part, regenerate) | **B** | `src/lib/chat.ts`, `app/api/chat/` |
| Deterministic checks and derived values | **B** | `src/lib/derive.ts` |
| Catalog, sample room, catalog scrape script | **B** | `data/catalog.json`, `data/room.json`, `scripts/scrape-catalog.ts` |
| Build kit (templates, py_compile gate, manual text) | **B** | `app/api/kit/`, `src/lib/kit/` |
| Demo mode cache | **B** | `data/cache/*.json`, `DEMO_MODE=1` |
| Baseline tools and supplies list (always in the cart, kept out of the Gemini catalog) | **A** | `data/supplies.json`, `src/lib/supplies.ts` |
| Thin routes: rebudget, catalog, room | **A** | `app/api/rebudget/`, `app/api/catalog/`, `app/api/room/` |
| Shared contracts | **Both** (change only after telling the other) | `src/lib/contracts.ts` |
| Docs | Both, own sections | `docs/` |

Touch points (pre-agreed):

- **A and B share `contracts.ts`.** Adding an optional field is fine after a message. Renaming or removing a field needs both owners.
- **A consumes B's output.** A builds against stub data typed by `contracts.ts` until B's routes land, then swaps stubs for real fetches.
- **B calls A's sim.** `generate.ts` runs `simulate()` for the response. Until A's `sim.ts` exists, B stubs it.

## 4. Git workflow

- `main` always builds (`npm run build`). Small PRs, merge often.
- Branches: `a/<topic>`, `b/<topic>`.
- `.env.local` holds `GEMINI_API_KEY`. Never commit it. It is in `.gitignore`.
- Run the app and look at the actual page before declaring anything done.

## 5. Timeline

| When | A: UX / Frontend | B: Gemini |
|---|---|---|
| Now to 10:45 | Paper: layout, tokens, key screens (see section 7). Scaffold Next.js app and stub components. | Verify Gemini model ids. `models.ts`, `gemini.ts`. Draft catalog format and sample room. |
| **10:45** | **Contracts, catalog format, sample room frozen.** | |
| 10:45-12:15 | Shell, prompt box, chips, tabs, buy list and checks UI against stub data. `RobotPreview` and `SimView` first pass. | `generate.ts` with schema-locked part ids and repair loop. First catalog entries. Run the 3 demo prompts by 11:30. |
| **12:15** | **Vertical slice: prompt, design, sim, buy list working end to end.** | |
| 12:15-1:30 | Budget slider (debounced `/api/rebudget`), `sim.ts` and `rebudget.ts`, chat panel UI. | Chat with function calling. `derive.ts` checks complete. Build kit routes and manual text. |
| **1:30** | **Slider, chat, build kit working.** | |
| 1:30-2:15 | Polish pass against the Paper designs. Limitations popover. Empty and error states. | Catalog spot-check for parts used in demos (set `verified:true`). Record `data/cache/` from real runs. |
| **2:15** | **Scope freeze.** Bug fixes only. | |
| 2:15-3:00 | Fix demo blockers. Check layout at 1280 px wide. | Fix demo blockers. Confirm `DEMO_MODE=1` works offline. |
| **3:00** | **Stop building.** Rehearse. Record the backup demo video. | |
| 3:00-4:00 | Submission: repo, video, slides, write-up. Buffer. | Submission: repo, video, slides, write-up. Buffer. |

If behind at 1:30: drop the printable manual styling and the IMU/extra sensors first. Core is prompt, design, sim, buy list, slider.

## 6. Demo script (3 min)

1. Type "Water my plants". Robot appears in 3D. Orbit it.
2. Simulation runs. The high-shelf plant fails on a cheap build (red, with the reason).
3. Drag the slider up. A pricier extendable arm appears and the plant turns green. No Gemini call.
4. Open the buy list. Show verified badges, reasons, CSV.
5. Ask Sprocket "why this arm?" then "make it cheaper".
6. Download the build kit. State plainly that it is untested on hardware.

Fallbacks: `DEMO_MODE=1` cached results if wifi fails. Backup screen recording as last resort.

## 7. Frontend design workflow (A, Paper)

**Status:** the Paper MCP server failed to connect in the first Claude Code session (`ECONNREFUSED`). Fix the connection before relying on it. Until it works, A can design in the Paper app directly and share frames by link or screenshot.

Design in Paper before building. Frames to produce, at **1280 px wide** (judges use laptops):

1. **Main screen**, three regions:
   - Left: prompt box, 3 example chips, budget slider ($50-$500 with dollar value), Generate button, progress text.
   - Center: tabs for 3D Robot and Simulation.
   - Right: Checks panel (top bar toggle). The buy list lives in the per-robot cart drawer (parts, vendor links, prices, verified, budget bar, Download kit, Export CSV). Chat panel not yet designed.
2. **Empty state** before the first prompt.
3. **Loading state** with plain progress text ("Picking parts...", "Checking power...").
4. **Failed-check state**: a failed check is plain English and never hidden.
5. **Cart drawer** (the buy list): per-robot parts with thumbnail, vendor, verified, price, listing link, subtotal, budget bar, CSV button.
6. **Chat panel** with Sprocket: small friendly avatar, short bubbles, a note when an action changed the design.
7. **Limitations popover**: kit untested on hardware, prices from vendor pages at scrape time, LiDAR scan is future work.

Design rules:

- Clean, no clutter. Colors and type as tokens (CSS variables), defined once in `app/globals.css`.
- Green (sage) buttons and fills use `#FBF8F3` text and icons, never dark text.
- Follow the `apple-design` skill for springs, sheet motion, translucent materials, typography and reduced-motion.
- The project name is one constant string. Never hardcode it elsewhere.

## 8. Open questions

| # | Question | Who decides | Needed by |
|---|---|---|---|
| 1 | `GEMINI_API_KEY`: who holds it, and is it restricted in AI Studio | B | Now |
| 2 | Current Gemini model ids (the ids in `DECISIONS.md` must be re-verified against the docs page) | B | Before coding |
| 3 | Fix the Paper MCP connection (`ECONNREFUSED`), or work in the Paper app directly | A | Now |
| 4 | Who spot-checks the catalog parts used in the 3 demos | Both | 1:30 |
| 5 | Submission requirements: repo, video, slides, write-up, who writes each | Both | 2:15 |
| 6 | Evidence chart (cost vs tasks completed): who builds it | A (data comes from `rebudget`) | 2:15 |
| 7 | Is `sim.ts` and `rebudget.ts` too much for A while also designing? If so, move them to B | Both | 10:45 |

## 9. Rules for Claude Code sessions (both of us)

- Read `docs/PLAN.md`, `docs/DECISIONS.md`, `src/lib/contracts.ts` and your own briefs first. Stay inside your owned files.
- Do not edit `contracts.ts` without telling the other owner.
- Code does math and checks. Gemini never computes prices, totals, or reach.
- Never put the API key in client code. Gemini calls are server-side only.
- Every feature degrades gracefully: no network means cached demo results.
- Run `npm run build` and look at the real page before saying anything is done.

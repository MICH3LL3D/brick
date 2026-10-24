# Decisions (frozen)

Deadline: 4:00 pm Sat 2026-10-24. Track: Best Use of Google Gemini. Runs locally. Product name: brick (one constant, `src/lib/brand.ts`).

## Product
A web playground. User types any task. Gemini designs ONE wheeled robot for it, from a real parts catalog. App shows a 3D preview, a simulation in a hand-authored apartment, a buy list, a budget slider, a chatbot that explains and edits, and a downloadable build kit.

## Scope rules
- Any task prompt is accepted. The simulator only understands "visit targets and act" (water, pickup, drop, photograph, touch). If a task does not fit, say so honestly and still return the design and buy list.
- Wheeled bases only (2 or 4 wheels, several sizes). Arms may be fixed servo arms OR extendable arms (telescoping / linear actuator). No legs, no flying.
- Gemini picks parts and reasons. Code does all math: dimensions, totals, pin map, power, reach, simulation.
- Gemini only returns part ids that exist in the catalog (response schema enum). Invented ids are rejected and retried, max 2 retries with check failures fed back.
- Room scanning is NOT built. Sample apartment is hand-written JSON. Say "LiDAR iPhone scan import is future work".
- Build kit is untested on hardware. Say so in the kit README and in the demo.
- Catalog comes from Gemini + search grounding on reliable vendors. Every entry carries `verified:false` until a human checks it. "Shopping web agents" is future work.
- Raspberry Pi model: target Pi 4B 4GB or Pi 5 using gpiozero (works on both). No RPi.GPIO.

## Gemini models (keep ALL ids in src/lib/models.ts, nowhere else)
- GENERATE: gemini-3.8-flash (try gemini-4-argon if quality is weak and latency is ok)
- CHAT: gemini-3.8-flash
- CATALOG_SCRAPE: gemini-3.8-flash with Google Search grounding
- CHEAP: gemini-3.5-flash-lite
- Do NOT use: gemini-2.5-*, gemini-3-pro-preview, -latest aliases.
- API key lives server-side only, env var GEMINI_API_KEY. Restrict the key in AI Studio.
- These ids are UNVERIFIED. Check https://ai.google.dev/gemini-api/docs/models before coding.

## Stack
Next.js + TypeScript, react-three-fiber for 3D, @google/genai server-side, zod, JSZip. JSON files for data. No database.

## Layout
`app/` and `components/` at repo root. Shared logic in `src/lib/` (import as `@/lib/...`).

## Timeline
- 10:45 contracts, catalog format, sample room frozen
- 12:15 vertical slice: prompt -> design -> sim -> buy list
- 1:30 slider, chat, build kit working
- 2:15 scope freeze
- 3:00 stop building, rehearse, record backup demo
- 3:00-4:00 buffer and submit

# Brief 1: Gemini pipeline (owner of /api/generate and /api/chat)

Read first: docs/DECISIONS.md, src/lib/contracts.ts. Do not edit contracts.ts; ask if a field is missing.

## Build
- src/lib/models.ts: model ids (see DECISIONS.md). Only place ids appear.
- src/lib/gemini.ts: server-only client from @google/genai using GEMINI_API_KEY.
- src/lib/generate.ts: `generateDesign(prompt, budgetUsd, room, catalog)`:
  1. Call Gemini with structured output. Response schema: Task (targetIds restricted to room.targets ids, or empty list if nothing fits) plus Design (partIds items restricted to an enum of catalog ids).
  2. Run `deriveAndCheck` (from brief 3) on the design. If any check fails, send the failure messages back to Gemini and retry. Max 2 retries.
  3. Return { task, design, derived, sim }. If still failing, return the best attempt with its failed checks visible. Never hide failures.
- System prompt rules: use only given part ids; prefer the cheapest valid design under budget; every chosen part gets a one-sentence reason; routine prefers the known ops (`KNOWN_OPS` in contracts.ts) but may invent a short snake_case op when none fits (the kit emits a TODO stub for it); if the task cannot be done with wheeled robots, say so in `summary` and return the closest feasible design.
- src/lib/chat.ts: `chat(messages, design, task)` using function calling with the ChatAction tools (set_budget, swap_part, regenerate). The chatbot is cute, short, plain-English, never invents prices, and says "I'm not sure" when unsure. Placeholder persona name: Sprocket.
- Routes: app/api/generate/route.ts, app/api/chat/route.ts. Validate all input and output with zod.
- DEMO_MODE=1 env flag: return cached JSON from data/cache/*.json for the 3 demo prompts so the demo survives bad wifi. Record the cache from real runs.

## Test early (by 11:30)
Run the 3 demo prompts: "water my plants", "bring my water bottle from the desk to the couch", "patrol the apartment and take photos of the windows". Check that outputs pass checks. Fix prompts before building more.

## Done when
All three demo prompts produce a valid design in under ~20 s, failed checks trigger a repair, and an invented part id is impossible.

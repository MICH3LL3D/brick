# Brief 4: App shell, UI, budget slider, chat panel

Read first: docs/DECISIONS.md, src/lib/contracts.ts. Load the frontend-design skill before designing. The product is named brick; keep the name in ONE constant (`src/lib/brand.ts`) and never hardcode it elsewhere.

## Build
- Next.js app with one main page, three regions:
  - Left: prompt box, example prompt chips (the 3 demo prompts), budget slider ($50-$500, shows dollar value), Generate button, loading state with plain progress text.
  - Center: tabs for 3D Robot and Simulation (use RobotPreview and SimView from brief 3; stub them until they land).
  - Right: Checks panel (top bar toggle); the buy list is the cart drawer. Then a chat panel (cute assistant, placeholder name Brick, small friendly avatar, short bubbles).
- Buy list: table of parts with name, vendor link, price, reason (from design.reasons), a "verified" badge, total, and Download CSV. Failed checks shown in plain English, never hidden.
- Slider: on release call POST /api/rebudget (debounce 150 ms while dragging, show the delta in parts changed and total cost). No Gemini call.
- Chat: POST /api/chat, apply returned `actions` (set_budget moves the slider; swap_part and regenerate update the design) and show a short note on what changed. Message history in React state.
- Download Build Kit button -> POST /api/kit (brief 5).
- Honest labels: a small "Limitations" popover: kit untested on hardware, prices from vendor pages at scrape time, room scanning via LiDAR iPhone is future work.
- Layout works at 1280 px wide first (judges use laptops). Keep it clean; no clutter.
- app/api/rebudget/route.ts and app/api/catalog|room routes: thin wrappers over brief 2/3 modules.

## Done when
A judge can type a task, drag the slider, watch the robot and buy list change, ask the chat to "make it cheaper", and download the kit, with no console errors.

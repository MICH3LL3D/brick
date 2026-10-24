# Brief 5: Build kit (zip download)

Read first: docs/DECISIONS.md, src/lib/contracts.ts.

## Build: POST /api/kit { design, task } -> zip via JSZip
Contents:
- `buy-list.csv`: part, vendor, url, price, qty, verified.
- `wiring.md`: pin table (from `Derived.pinMap`), power diagram in text/ASCII (battery -> regulator -> Pi; motor supply separate), and per-part wiring notes from the catalog `notes`.
- `pi/` Raspberry Pi code, generated from templates, NOT written by Gemini:
  - `config.py` (pin numbers, arm limits, speeds from catalog caps)
  - `drivers/` one small gpiozero-based file per part type used (drive, servo arm, linear arm, pump, camera)
  - `main.py` runs the routine: one function call per `RoutineStep` op, in order
  - `selftest.py` exercises each part alone with safe low speeds
  - `requirements.txt`, `README.md` (how to flash, install, run; says clearly: "This code has not been tested on hardware. Test with wheels off the ground first.")
  - Use gpiozero (works on Pi 4B and Pi 5). No RPi.GPIO.
- `manual.html`: printable assembly manual, numbered steps, safety notes, parts checklist. Step text can come from ONE Gemini call (CHEAP model) that is given the parts list and must output a JSON array of {title, body}; fall back to template text if the call fails. Validate with zod.
- Gate: run `python -m py_compile` on every generated .py file inside the route; if any fails, return an error instead of a zip.

## Done when
The zip downloads for each of the 3 demo designs, all .py files compile, the README states the untested-hardware caveat, and manual.html prints cleanly.

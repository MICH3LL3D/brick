# Brief 2: Parts catalog + sample apartment

Read first: docs/DECISIONS.md, src/lib/contracts.ts.

## Build
- data/catalog.json: an array of `Part` (validate with zod). Target ~35-50 parts covering:
  - chassis: 2WD small, 2WD medium, 4WD medium, 4WD large (differing payload, speed, footprint)
  - controller: Raspberry Pi 4B 4GB and Pi 5 4GB
  - motor drivers (2), servo driver board (PCA9685), ADC (ADS1115)
  - arms: 2 fixed servo arms (short and long reach), 2 extendable arms (linear actuator / telescoping; reach min < max), with lift height and payload
  - tools: gripper, water pump + nozzle, tank (2 sizes), camera mount
  - sensors: Pi camera, ultrasonic distance, IMU
  - power: 2-3 battery packs, 5V regulator for the Pi, separate motor supply notes
- scripts/scrape-catalog.ts: asks Gemini (CATALOG_SCRAPE model, Google Search grounding) to propose parts from reliable vendors (Adafruit, SparkFun, Pololu, DFRobot, Amazon only as fallback). It writes candidates to data/catalog.candidates.json. A human then merges into catalog.json. Every entry starts `verified:false`. Real URLs only; if Gemini cannot give a URL, drop the entry.
- Fill `notes` with real wiring gotchas (3.3V logic, no analog input on the Pi, servos need external power, motors need their own supply). Check against datasheets, not memory.
- data/room.json: one hand-written apartment (`Room`): about 6000 x 4500 mm, 4-6 obstacles (couch, table, desk, shelf), 2 doorways (one narrow, ~700 mm), and 6-8 targets: 3 plants (one on the floor, one on a table, one on a high shelf), a water bottle on the desk, a couch drop spot, 2 windows to photograph. Make heights vary so arm reach actually matters.
- Make the catalog yield real tradeoffs: a cheap build must be able to fail the high-shelf plant, and a pricier extendable arm must fix it.

## Done when
catalog.json passes zod, room.json passes zod, a printed table of parts by price looks sane, and a human has spot-checked at least the parts used in the 3 demo designs (set their `verified:true`).

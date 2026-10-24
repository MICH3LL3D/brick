# Project overview

## One line
A web playground where anyone types a task in plain English ("water my plants"), and Gemini designs a wheeled Raspberry Pi robot for it from real, buyable parts. The app shows the robot in 3D, simulates it doing the task in a sample apartment, gives a buy list, lets a budget slider reshape the design, has a cute chatbot that explains and edits it, and exports a build kit (Pi code, wiring, assembly manual).

## Who it is for
Non-technical people who want a robot for a job, and robotics hobbyists who want a fast, buyable starting design. It bridges the gap between "I have an idea" and "here is what to buy and how to build it".

## Features (all in scope)
1. Prompt to robot: Gemini generates ONE robot per prompt, composed only from catalog part ids (chassis, Raspberry Pi, motor driver, arm, tool, sensors, power). Any task is accepted.
2. Wheeled bases, at least 4 wheels (forced rule), several sizes. Arms can be fixed servo arms or extendable (telescoping / linear actuator) arms.
3. Checks done by code, not Gemini: pin budget, power and battery, payload, arm reach vs target height, tank size, doorway fit. Failures go back to Gemini for up to 2 repair attempts, and are always shown to the user.
4. 3D preview: procedural robot from catalog dimensions, orbit controls, arm extends and retracts.
5. Simulation: hand-authored sample apartment, top-down view, robot drives along an A* path, visits targets (water, pickup, drop, photograph, touch), shows green/red events with reasons, battery use, duration.
6. Budget slider ($50-$500): deterministic rebudget (cheapest valid parts, then best upgrade per dollar). Runs live with no Gemini call. A cheap build visibly fails the high-shelf plant; a pricier extendable arm fixes it.
7. Buy list: parts with vendor links, prices, a reason for each part, a verified badge, totals, CSV download.
8. Chatbot (placeholder name Sprocket): explains choices, answers "why", and edits the design through function calls (set budget, swap part, regenerate). Says "I'm not sure" rather than guessing prices.
9. Build kit zip: buy-list.csv, wiring.md, Raspberry Pi Python (gpiozero, template-generated, compile-checked), selftest.py, README, and a printable assembly manual.
10. Catalog: built with Gemini + search grounding over reliable vendors, each entry unverified until a human spot-checks it.
11. Demo mode: cached results for the 3 demo prompts so the demo survives bad wifi.

## Out of scope (say so openly)
- Room scanning (LiDAR iPhone import) is future work; the sample apartment is hand-written.
- Shopping web agents are future work.
- No legs, no flying, no real physics engine.
- Build kit is untested on hardware.
- (Name settled: the product is called brick, set in one constant in `src/lib/brand.ts`.)

## Why it is a strong Track 3 entry
Gemini is the core, used four ways: structured generation locked to catalog ids, function-calling chat that edits the design, search-grounded catalog building, and generated assembly-manual text. Code verifies everything Gemini proposes, so outputs are buildable and checkable.

## Novelty (be honest)
Similar tools exist (Mirai, MechaCanvas, BaseFrame, PartGenie, CircuitMind, Text2Robot). Ours is the combination: budget-to-capability loop, verified buyability, build kit, honest advisor.

## Demo prompts
1. "Water my plants"  2. "Bring my water bottle from the desk to the couch"  3. "Patrol the apartment and take photos of the windows"

## Still needed from the team
GEMINI_API_KEY; someone to spot-check catalog parts used in the demos; submission requirements (repo, video, slides, write-up); demo script, an evidence chart (cost vs tasks completed), and a backup demo recording.

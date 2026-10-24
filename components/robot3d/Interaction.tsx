"use client";
// TASK C owns this file: selection, hover labels, wiring lines.
// Implementation lives in ./interaction/; this module keeps the public entry points stable.
//
// Selectable: click selects; hover shows a name label (kept while selected).
//
// Wiring: cables from the Pi, battery, regulator and motor drivers.
export { Selectable } from "./interaction/Selectable";
export { Wiring } from "./interaction/Wiring";

"use client";
// TASK C owns this file: selection, hover labels, drag on the deck, wiring lines.
// Implementation lives in ./interaction/; this module keeps the public entry points stable.
//
// Selectable: click selects; hover shows a name label (kept while selected); when `draggable`,
// press and drag moves the part on the horizontal plane at its height and calls
// `onDrag({ x: mm forward, y: mm left })` relative to its layout spot. Optional `bounds`
// (world metres) clamps the part's centre while dragging.
//
// Wiring: cables from the Pi, battery, regulator and motor drivers. Optional `offsets` (mm)
// moves cable ends with parts the user has dragged.
export { Selectable, type DeckBounds } from "./interaction/Selectable";
export { Wiring } from "./interaction/Wiring";

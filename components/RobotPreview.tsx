"use client";

import { useRef } from "react";
import type { Part } from "@/lib/contracts";
import type { Layers } from "./LayersPanel";

export type Offsets = Record<string, { x: number; y: number }>;

const INK = "#F2EDE4", MUTED = "#A39B90", GOLD = "#C8A56A", BLUE = "#3187A0", BG = "#0B0A09", PANEL = "#151412";

// Side-view schematic drawn from the design's parts; matches the Paper frames, not a real 3D scene.
type Box = { x: number; y: number; w: number; h: number };

// Fixed internal slots, then a grid of deck slots for everything else, so every catalog part is drawn and clickable.
const INTERNAL: Record<string, Box> = { power: { x: 104, y: 168, w: 60, h: 26 }, controller: { x: 172, y: 168, w: 52, h: 26 }, motor_driver: { x: 232, y: 172, w: 44, h: 20 } };
const deckSlot = (i: number): Box => ({ x: 96 + 46 * (i % 3), y: 128 - 30 * Math.floor(i / 3), w: 42, h: 26 });

const labelOf = (x: Part) =>
  x.category === "controller" ? x.name.match(/Pi \d/)?.[0] ?? "Pi"
  : x.category === "power" ? (x.id.startsWith("reg") ? "Regulator" : "Battery")
  : x.category === "motor_driver" ? "Driver"
  : (x.id.match(/pump|gripper|cam|tank|servo|adc|us-|dist|imu/)?.[0] ?? x.category).replace(/^us-|^dist/, "Range").replace(/^cam$/, "Camera").replace(/^[a-z]/, (c) => c.toUpperCase());

// Side-view schematic drawn from the design's parts; matches the Paper frames, not a real 3D scene.
export function RobotPreview(p: { parts: Part[]; layers: Layers; selectedId: string | null; offsets: Offsets; onSelect: (id: string | null) => void; onMove: (id: string, o: { x: number; y: number }) => void }) {
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const arm = p.parts.find((x) => x.category === "arm");
  const chassis = p.parts.find((x) => x.category === "chassis");
  const reach = arm?.caps.reachMm?.max ?? 0;
  const dx = Math.max(20, Math.min(90, (56 * reach) / 420));
  const tip = { x: 244 + dx, y: 60 };
  const open = !p.layers.shell;

  const toSvg = (e: React.PointerEvent) => {
    const m = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!.getScreenCTM()!.inverse();
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: pt.x, y: pt.y };
  };
  const down = (e: React.PointerEvent, id: string, movable: boolean) => {
    e.stopPropagation();
    p.onSelect(id);
    if (!movable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = p.offsets[id] ?? { x: 0, y: 0 };
    const s = toSvg(e);
    drag.current = { id, sx: s.x, sy: s.y, ox: o.x, oy: o.y };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = toSvg(e);
    p.onMove(d.id, { x: d.ox + s.x - d.sx, y: d.oy + s.y - d.sy });
  };
  const up = () => { drag.current = null; };

  // Internals (battery, Pi, driver) sit inside the body; the first of each category takes its fixed slot.
  const placed = new Map<string, Box>();
  const taken = new Set<string>();
  let extra = 0;
  for (const x of p.parts) {
    if (x.category === "chassis" || x.category === "arm") continue;
    const slot = INTERNAL[x.category];
    if (slot && !taken.has(x.category)) { taken.add(x.category); placed.set(x.id, slot); } else placed.set(x.id, deckSlot(extra++));
  }
  const inside = (x: Part) => INTERNAL[x.category] === placed.get(x.id);
  const has = (c: string) => p.parts.some((x) => x.category === c);

  const sel = (id: string) => p.selectedId === id;
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy="214" r="17" fill={BG} stroke={INK} strokeWidth="1.25" />
      {open && p.layers.parts && has("chassis") && <rect x={cx - 6} y="207" width="12" height="14" rx="2" fill={PANEL} stroke={GOLD} />}
    </g>
  );

  return (
    <svg viewBox="0 0 380 280" role="img" aria-label="Robot schematic" onPointerDown={() => p.onSelect(null)}>
      <ellipse cx="190" cy="228" rx="150" ry="28" fill="none" stroke="#242220" />
      <ellipse cx="190" cy="228" rx="96" ry="17" fill="none" stroke="#242220" />

      {chassis && (
        <g onPointerDown={(e) => down(e, chassis.id, false)} role="button" aria-label={chassis.name} style={{ cursor: "pointer" }}>
          {open && p.layers.frame && (
            <g>
              <rect x="92" y="156" width="196" height="48" rx="8" fill="none" stroke={sel(chassis.id) ? GOLD : MUTED} strokeWidth="1.25" strokeDasharray="4 4" opacity={sel(chassis.id) ? 1 : 0.45} />
              <path d="M100 166 H280 M100 194 H280" stroke={MUTED} opacity=".7" fill="none" />
            </g>
          )}
          {!open && <rect x="92" y="156" width="196" height="48" rx="8" fill={PANEL} stroke={sel(chassis.id) ? GOLD : INK} strokeWidth={sel(chassis.id) ? 2 : 1.25} />}
          {open && !p.layers.frame && <rect x="92" y="156" width="196" height="48" rx="8" fill="transparent" />}
          {wheel(126)}
          {wheel(254)}
        </g>
      )}

      {open && p.layers.wiring && (
        <path
          d={[has("power") && has("controller") && "M164 181 H172", has("controller") && has("motor_driver") && "M224 181 H232", has("motor_driver") && chassis && "M254 192 V199 H126 V207 M254 199 V207"].filter(Boolean).join(" ")}
          fill="none" stroke={BLUE} strokeWidth="1.25"
        />
      )}

      {p.layers.parts && (
        <g fontFamily="var(--mono)" fontSize="7" textAnchor="middle">
          {p.parts.filter((x) => placed.has(x.id)).map((x) => {
            const b = placed.get(x.id)!, o = p.offsets[x.id] ?? { x: 0, y: 0 }, on = sel(x.id);
            return (
              <g key={x.id} className="part" transform={`translate(${o.x} ${o.y})`} onPointerDown={(e) => down(e, x.id, true)} onPointerMove={move} onPointerUp={up} role="button" aria-label={x.name}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={on ? "#2A2418" : PANEL} stroke={inside(x) ? GOLD : MUTED} strokeWidth={on ? 2 : 1.25} />
                <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} fill={on ? INK : MUTED}>{labelOf(x)}</text>
                {on && [[b.x - 3, b.y - 3], [b.x + b.w - 3, b.y - 3], [b.x - 3, b.y + b.h - 3], [b.x + b.w - 3, b.y + b.h - 3]].map(([cx, cy]) => <rect key={`${cx}${cy}`} x={cx} y={cy} width="6" height="6" fill={BG} stroke={GOLD} />)}
              </g>
            );
          })}
        </g>
      )}

      {arm && (
        <g onPointerDown={(e) => down(e, arm.id, false)} role="button" aria-label={arm.name} style={{ cursor: "pointer" }}>
          <path d={`M244 156 L244 98 L${tip.x - 4} ${tip.y}`} fill="none" stroke="transparent" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M244 156 L244 98 L${tip.x - 4} ${tip.y}`} fill="none" stroke={sel(arm.id) ? GOLD : INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="244" cy="98" r="5" fill={BG} stroke={sel(arm.id) ? GOLD : INK} strokeWidth="1.5" />
          <circle cx={tip.x + 4} cy="57" r="6" fill={BLUE} />
          <circle cx={tip.x + 4} cy="57" r="11" fill="none" stroke={BLUE} opacity=".5" />
          <path d={`M${tip.x + 4} 69 L${tip.x + 4} 228`} fill="none" stroke={BLUE} strokeDasharray="3 4" opacity=".7" />
        </g>
      )}
    </svg>
  );
}

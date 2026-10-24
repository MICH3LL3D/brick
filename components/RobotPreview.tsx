"use client";

import { useRef } from "react";
import type { Part } from "@/lib/contracts";
import type { Layers } from "./LayersPanel";

export type Offsets = Record<string, { x: number; y: number }>;

const INK = "#F2EDE4", MUTED = "#A39B90", GOLD = "#C8A56A", BLUE = "#3187A0", BG = "#0B0A09", PANEL = "#151412";

// Side-view schematic drawn from the design's parts; matches the Paper frames, not a real 3D scene.
export function RobotPreview(p: { parts: Part[]; layers: Layers; selectedId: string | null; offsets: Offsets; onSelect: (id: string | null) => void; onMove: (id: string, o: { x: number; y: number }) => void }) {
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const arm = p.parts.find((x) => x.category === "arm");
  const pi = p.parts.find((x) => x.category === "controller");
  const reach = arm?.caps.reachMm?.max ?? 0;
  const dx = Math.max(20, Math.min(90, (56 * reach) / 420));
  const tip = { x: 244 + dx, y: 60 };
  const open = !p.layers.shell;

  const toSvg = (e: React.PointerEvent) => {
    const m = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!.getScreenCTM()!.inverse();
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: pt.x, y: pt.y };
  };
  const down = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = p.offsets[id] ?? { x: 0, y: 0 };
    const s = toSvg(e);
    drag.current = { id, sx: s.x, sy: s.y, ox: o.x, oy: o.y };
    p.onSelect(id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = toSvg(e);
    p.onMove(d.id, { x: d.ox + s.x - d.sx, y: d.oy + s.y - d.sy });
  };
  const up = () => { drag.current = null; };

  const piOff = pi ? p.offsets[pi.id] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const piSel = pi && p.selectedId === pi.id;

  return (
    <svg viewBox="0 0 380 280" role="img" aria-label="Robot schematic" onPointerDown={() => p.onSelect(null)}>
      <ellipse cx="190" cy="228" rx="150" ry="28" fill="none" stroke="#242220" />
      <ellipse cx="190" cy="228" rx="96" ry="17" fill="none" stroke="#242220" />

      {open && p.layers.frame && (
        <g>
          <rect x="92" y="156" width="196" height="48" rx="8" fill="none" stroke={MUTED} strokeWidth="1.25" strokeDasharray="4 4" opacity=".45" />
          <path d="M100 166 H280 M100 194 H280" stroke={MUTED} opacity=".7" fill="none" />
        </g>
      )}
      {!open && <rect x="92" y="156" width="196" height="48" rx="8" fill={PANEL} stroke={INK} strokeWidth="1.25" />}

      <circle cx="126" cy="214" r="17" fill={BG} stroke={INK} strokeWidth="1.25" />
      <circle cx="254" cy="214" r="17" fill={BG} stroke={INK} strokeWidth="1.25" />
      <rect x="124" y="128" width="72" height="28" rx="5" fill={PANEL} stroke={MUTED} strokeWidth="1.25" />

      {open && p.layers.wiring && <path d="M164 181 H172 M224 181 H232 M254 192 V199 H126 V207 M254 199 V207" fill="none" stroke={BLUE} strokeWidth="1.25" />}
      {open && p.layers.parts && (
        <g fontFamily="var(--mono)" fontSize="7" textAnchor="middle">
          <rect x="120" y="207" width="12" height="14" rx="2" fill={PANEL} stroke={GOLD} />
          <rect x="248" y="207" width="12" height="14" rx="2" fill={PANEL} stroke={GOLD} />
          <rect x="104" y="168" width="60" height="26" rx="3" fill={PANEL} stroke={GOLD} strokeWidth="1.25" />
          <text x="134" y="184" fill={MUTED}>Battery</text>
          <rect x="232" y="172" width="44" height="20" rx="3" fill={PANEL} stroke={MUTED} strokeWidth="1.25" />
          <text x="254" y="185" fill={MUTED}>Driver</text>
          {pi && (
            <g className="part" transform={`translate(${piOff.x} ${piOff.y})`} onPointerDown={(e) => down(e, pi.id)} onPointerMove={move} onPointerUp={up} role="button" aria-label="Raspberry Pi">
              <rect x="172" y="168" width="52" height="26" rx="3" fill={piSel ? "#2A2418" : PANEL} stroke={GOLD} strokeWidth={piSel ? 2 : 1.25} />
              <text x="198" y="184" fill={INK}>Pi 5</text>
              {piSel && [[169, 165], [221, 165], [169, 191], [221, 191]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="6" height="6" fill={BG} stroke={GOLD} />)}
            </g>
          )}
        </g>
      )}

      {arm && (
        <g>
          <path d={`M244 156 L244 98 L${tip.x - 4} ${tip.y}`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="244" cy="98" r="5" fill={BG} stroke={INK} strokeWidth="1.5" />
          <circle cx={tip.x + 4} cy="57" r="6" fill={BLUE} />
          <circle cx={tip.x + 4} cy="57" r="11" fill="none" stroke={BLUE} opacity=".5" />
          <path d={`M${tip.x + 4} 69 L${tip.x + 4} 228`} fill="none" stroke={BLUE} strokeDasharray="3 4" opacity=".7" />
        </g>
      )}
    </svg>
  );
}

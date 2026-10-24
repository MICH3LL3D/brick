"use client";

import { useState } from "react";
import { FIXED_PINS } from "@/lib/pi-header";
import type { WireT } from "@/lib/manual-format";

// Wire diagram and step-by-step list for a wiring page, drawn from the wire list the generator built from the checked
// pin map (see the Paper pages "Build manual / 04 Driver signals" and "05 Battery power"). Devices sit on the left,
// the Pi's 40-pin header on the right, one numbered step per wire. Wires up to the current step are drawn; the current one glows.

export const WIRE_COLOR: Record<string, string> = { red: "#D94F41", black: "#222B26", orange: "#E8813A", blue: "#4179C7", yellow: "#E4B73A", white: "#FFFFFF", green: "#3E9E63", purple: "#865BB4", brown: "#774A28", grey: "#A9A9A0" };

const PI = "Raspberry Pi";
const BLOCK_W = 200;
const ROW = 22;
const X0 = 12;
const HEADER_X = 560;
const BOARD = { x: 520, y: 130, w: 450, h: 112 };
const PAD = (pin: number) => ({ x: HEADER_X + ((pin - 1) >> 1) * 21, y: BOARD.y + (pin % 2 === 0 ? 30 : 56) });

type Dev = { name: string; ports: string[]; y: number; h: number };

function layout(wires: WireT[]) {
  const devs = new Map<string, Dev>();
  let y = 16;
  for (const w of wires) {
    for (const e of [w.a, w.b]) {
      if (!e || e.dev === PI) continue;
      const d = devs.get(e.dev) ?? { name: e.dev, ports: [], y: 0, h: 0 };
      if (!d.ports.includes(e.port)) d.ports.push(e.port);
      devs.set(e.dev, d);
    }
  }
  for (const d of devs.values()) {
    d.h = 38 + d.ports.length * ROW;
    d.y = y;
    y += d.h + 22;
  }
  return { devs, height: Math.max(y, BOARD.y + BOARD.h + 24) };
}

const endLabel = (e?: WireT["a"], fallback = "") => (!e ? fallback : e.dev === PI ? `Pi pin ${e.pin ?? "?"} (${e.port})` : `${e.dev} ${e.port}`.trim());

export function WiringDiagram({ wires }: { wires: WireT[] }) {
  const drawn = wires.filter((w) => w.a && w.b);
  const [cur, setCur] = useState(-1); // -1 = every wire shown, none highlighted
  const { devs, height } = layout(drawn);
  const usedPins = new Set(drawn.flatMap((w) => [w.a, w.b]).filter((e) => e?.dev === PI && e.pin).map((e) => e!.pin!));
  const piPorts = [...new Set(drawn.flatMap((w) => [w.a, w.b]).filter((e) => e?.dev === PI && !e.pin).map((e) => e!.port))];

  const point = (e: NonNullable<WireT["a"]>) => {
    if (e.dev === PI) {
      if (e.pin) return { ...PAD(e.pin), top: true };
      return { x: BOARD.x, y: BOARD.y + 30 + piPorts.indexOf(e.port) * ROW, top: false };
    }
    const d = devs.get(e.dev)!;
    return { x: X0 + BLOCK_W, y: d.y + 38 + d.ports.indexOf(e.port) * ROW - 6, top: false };
  };
  // Wires between two devices on the left loop out to the right; each gets its own distance so they do not overlap.
  const loopIndex = new Map<WireT, number>();
  drawn.filter((w) => w.a!.dev !== PI && w.b!.dev !== PI).forEach((w, k) => loopIndex.set(w, k));
  const path = (w: WireT) => {
    const p = point(w.a!), q = point(w.b!);
    const from = p.x <= q.x ? p : q, to = p.x <= q.x ? q : p; // draw left to right
    if (to.top) return `M${from.x} ${from.y} C${from.x + 150} ${from.y}, ${to.x} ${to.y - 110}, ${to.x} ${to.y}`;
    if (Math.abs(from.x - to.x) < 4) {
      const out = 40 + (loopIndex.get(w) ?? 0) * 16;
      return `M${from.x} ${from.y} C${from.x + out + 30} ${from.y}, ${to.x + out + 30} ${to.y}, ${to.x} ${to.y}`;
    }
    return `M${from.x} ${from.y} C${from.x + 150} ${from.y}, ${to.x - 150} ${to.y}, ${to.x} ${to.y}`;
  };

  const counts = wires.reduce<Record<string, number>>((m, w) => ({ ...m, [w.color]: (m[w.color] ?? 0) + 1 }), {});
  const last = wires.length - 1;
  const step = Math.min(cur, last); // -1 when showing everything

  return (
    <div className="wd">
      <div className="wd-need" aria-label="Wires needed">
        {Object.entries(counts).map(([c, n]) => (
          <div key={c}><svg width="64" height="22" viewBox="0 0 64 22" aria-hidden><path d="M4 16 C20 2, 44 2, 60 16" fill="none" stroke="#222B26" strokeWidth="7" strokeLinecap="round" /><path d="M4 16 C20 2, 44 2, 60 16" fill="none" stroke={WIRE_COLOR[c]} strokeWidth="4" strokeLinecap="round" /></svg><b>{n}x</b><span>{c} wire</span></div>
        ))}
      </div>

      {drawn.length > 0 && (
        <svg className="wd-svg" viewBox={`0 0 1000 ${height}`} role="img" aria-label={step < 0 ? `Wiring diagram with all ${wires.length} wires` : `Wiring diagram, wire ${step + 1} of ${wires.length}: ${endLabel(wires[step].a, wires[step].from)} to ${endLabel(wires[step].b, wires[step].to)}`}>
          {[...devs.values()].map((d) => (
            <g key={d.name}>
              <rect x={X0} y={d.y} width={BLOCK_W} height={d.h} rx="10" fill="#E7D9D4" stroke="#222B26" strokeWidth="2" />
              <text x={X0 + 12} y={d.y + 22} className="wd-title">{d.name.length > 24 ? `${d.name.slice(0, 23)}…` : d.name}</text>
              {d.ports.map((p, i) => (
                <g key={p}>
                  <text x={X0 + BLOCK_W - 16} y={d.y + 38 + i * ROW} textAnchor="end" className="wd-port">{p}</text>
                  <circle cx={X0 + BLOCK_W} cy={d.y + 38 + i * ROW - 6} r="5" fill="#C98F5A" stroke="#222B26" strokeWidth="1.5" />
                </g>
              ))}
            </g>
          ))}

          <rect x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h} rx="12" fill="#CFE3CF" stroke="#222B26" strokeWidth="2" />
          <text x={BOARD.x + 16} y={BOARD.y + BOARD.h - 14} className="wd-title">Raspberry Pi</text>
          <text x={BOARD.x + BOARD.w - 12} y={BOARD.y + BOARD.h - 14} textAnchor="end" className="wd-port">pin 1 is the corner nearest the SD card</text>
          {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => {
            const { x, y } = PAD(n);
            const used = usedPins.has(n);
            return (
              <g key={n}>
                <rect x={x - 7} y={y - 7} width="14" height="14" rx={n === 1 ? 1 : 7} fill={used ? "#E4B73A" : "#222B26"} stroke="#222B26" strokeWidth="1" />
                {(used || n === 1) && <text x={x} y={y + (n % 2 === 0 ? -12 : 21)} textAnchor="middle" className="wd-pin">{n}</text>}
                {used && FIXED_PINS[n] && <text x={x} y={y + (n % 2 === 0 ? -24 : 33)} textAnchor="middle" className="wd-port">{FIXED_PINS[n]}</text>}
              </g>
            );
          })}
          {piPorts.map((p, i) => (
            <g key={p}>
              <circle cx={BOARD.x} cy={BOARD.y + 30 + i * ROW} r="5" fill="#C98F5A" stroke="#222B26" strokeWidth="1.5" />
              <text x={BOARD.x + 12} y={BOARD.y + 34 + i * ROW} className="wd-port">{p}</text>
            </g>
          ))}

          {wires.map((w, i) => {
            if (!w.a || !w.b) return null;
            const d = path(w);
            const state = step < 0 ? "all" : i === step ? "now" : i < step ? "past" : "later";
            if (state === "later") return null;
            return (
              <g key={i} opacity={state === "past" ? 0.45 : 1}>
                {state === "now" && <path d={d} fill="none" stroke="#F4E4A1" strokeWidth="13" strokeLinecap="round" opacity="0.9" />}
                <path d={d} fill="none" stroke="#222B26" strokeWidth="7" strokeLinecap="round" />
                <path d={d} fill="none" stroke={WIRE_COLOR[w.color]} strokeWidth="4" strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      )}

      <ol className="wd-steps">
        {wires.map((w, i) => (
          <li key={i} className={i === step ? "now" : step >= 0 && i > step ? "later" : undefined}>
            <button type="button" onClick={() => setCur(i)} aria-current={i === step ? "step" : undefined}>
              <i>{i + 1}</i>
              <span className="wd-dot" style={{ background: WIRE_COLOR[w.color], borderColor: w.color === "white" ? "#222B26" : WIRE_COLOR[w.color] }} />
              <span>Connect <b>{endLabel(w.a, w.from)}</b> to <b>{endLabel(w.b, w.to)}</b> with the {w.color} wire.</span>
            </button>
          </li>
        ))}
      </ol>
      {wires.length > 1 && (
        <div className="wd-nav">
          <button type="button" onClick={() => setCur(step <= 0 ? -1 : step - 1)} disabled={step < 0}>Previous wire</button>
          <button type="button" onClick={() => setCur(-1)} disabled={step < 0}>Show all</button>
          <span aria-live="polite">{step < 0 ? `${wires.length} wires` : `Wire ${step + 1} of ${wires.length}`}</span>
          <button type="button" onClick={() => setCur(step + 1)} disabled={step === last}>{step < 0 ? "Start wiring" : "Next wire"}</button>
        </div>
      )}
    </div>
  );
}

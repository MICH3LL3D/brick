"use client";

import { useEffect, useState } from "react";
import type { RoomT, SimT } from "@/lib/stub";

export function SimView({ room, sim }: { room: RoomT; sim: SimT }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v >= sim.durationS ? 0 : v + 0.25)), 100);
    return () => clearInterval(id);
  }, [sim]);

  // Linear interpolation along the precomputed path.
  const at = sim.path.findLast((s) => s.t <= t) ?? sim.path[0];
  const next = sim.path.find((s) => s.t > t) ?? at;
  const k = next.t === at.t ? 0 : (t - at.t) / (next.t - at.t);
  const pos = { x: at.x + (next.x - at.x) * k, y: at.y + (next.y - at.y) * k };

  return (
    <div className="sim">
      <svg viewBox={`0 0 ${room.widthMm} ${room.depthMm}`} role="img" aria-label="Top-down simulation">
        {room.obstacles.map((o) => <rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.d} fill="#1C1A18" stroke="#242220" strokeWidth="8" />)}
        <polyline points={sim.path.map((s) => `${s.x},${s.y}`).join(" ")} fill="none" stroke="#3187A0" strokeWidth="10" strokeDasharray="30 30" opacity=".7" />
        {room.targets.map((g) => {
          const ev = sim.events.find((e) => e.targetId === g.id);
          return <circle key={g.id} cx={g.x} cy={g.y} r="70" fill={ev ? (ev.ok ? "#3187A0" : "#E58A7B") : "#A39B90"} />;
        })}
        <circle cx={pos.x} cy={pos.y} r="90" fill="#F2EDE4" />
      </svg>
      <ul>
        <li className="muted">{room.name} · {sim.durationS}s · battery {sim.batteryUsedPct}%</li>
        {sim.events.map((e) => <li key={`${e.targetId}${e.t}`} className={e.ok ? "ok" : "bad"}>{e.ok ? "✓" : "✕"} {e.note}</li>)}
      </ul>
    </div>
  );
}

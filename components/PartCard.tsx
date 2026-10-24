import type { Part } from "@/lib/contracts";

export function PartCard(p: { part: Part; reason?: string; onSwap: () => void; onReset: () => void; onDelete: () => void }) {
  return (
    <div className="card" onPointerDown={(e) => e.stopPropagation()}>
      <div className="top">
        <div><b>{p.part.name}</b><small>{p.reason}</small></div>
      </div>
      <div className="meta"><span>${p.part.priceUsd}</span><span className={p.part.verified ? "verified" : "unverified"}>{p.part.verified ? "Verified" : "Unverified"}</span></div>
      <div className="menu">
        <button className="item" onClick={p.onSwap}>⇄ Swap part</button>
        <button className="item" onClick={p.onReset}>↺ Reset position</button>
        <button className="item danger" onClick={p.onDelete}>Delete part</button>
      </div>
      <p className="note">Removing a part re-runs the checks. You can undo for 10 seconds.</p>
    </div>
  );
}

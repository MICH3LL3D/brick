import type { Part } from "@/lib/contracts";
import { usd } from "@/lib/money";

export function PartCard(p: { part: Part; reason?: string; inCart: boolean; onCart: () => void; onSwap: () => void; onReset: () => void; onDelete: () => void }) {
  return (
    <div className="card" onPointerDown={(e) => e.stopPropagation()}>
      <div className="top">
        <div><b>{p.part.name}</b><small>{p.reason}</small></div>
      </div>
      <div className="meta"><span>{usd(p.part.priceUsd)}</span><span className={p.part.verified ? "verified" : "unverified"}>{p.part.verified ? "Verified" : "Unverified"}</span></div>
      <button className="card-cart" onClick={p.onCart}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1.5 2.5h2.2l1.6 8.2h8.2l1.5-5.7H4.4" /><circle cx="6.5" cy="14.5" r="1.1" fill="currentColor" /><circle cx="12.5" cy="14.5" r="1.1" fill="currentColor" />
        </svg>
        {p.inCart ? "Remove from cart" : "Add to cart"}
      </button>
      <div className="menu">
        <button className="item" onClick={p.onSwap}>⇄ Swap part</button>
        <button className="item" onClick={p.onReset}>↺ Reset position</button>
        <button className="item danger" onClick={p.onDelete}>Delete part</button>
      </div>
      <p className="note">Removing a part re-runs the checks. You can undo for 10 seconds.</p>
    </div>
  );
}

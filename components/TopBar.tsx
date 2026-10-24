import Link from "next/link";
import { Owl, Wordmark } from "./Logo";
import { ModeSwitch, type Mode } from "./ModeSwitch";

export type Tab = "robot" | "sim";

export function TopBar(p: {
  tab: Tab; onTab: (t: Tab) => void;
  checksOpen: boolean; onChecks: () => void;
  failed: number; cartCount: number; onCart: () => void;
  historyOpen: boolean; onHistory: () => void;
  mode: Mode; onMode: (m: Mode) => void;
}) {
  return (
    <div className="topbar">
      <div className="side">
        <button className={`icon-btn${p.historyOpen ? " on" : ""}`} onClick={p.onHistory} aria-label="Toggle robot history" aria-pressed={p.historyOpen}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#A39B90" strokeWidth="1.5">
            <rect x="1.75" y="2.75" width="14.5" height="12.5" rx="3" /><path d="M6.75 3v12" />
          </svg>
        </button>
        <Link className="logo" href="/"><Owl size={28} /><Wordmark /></Link>
        <ModeSwitch mode={p.mode} onMode={p.onMode} />
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={p.tab === "robot"} className={`tab${p.tab === "robot" ? " on" : ""}`} onClick={() => p.onTab("robot")}>3D Robot</button>
        <button role="tab" aria-selected={p.tab === "sim"} className={`tab${p.tab === "sim" ? " on" : ""}`} onClick={() => p.onTab("sim")}>Simulation</button>
      </div>
      <div className="side end">
        <button className={`navlink${p.checksOpen ? " on" : ""}`} onClick={p.onChecks}>
          Checks {p.failed > 0 && <span className="badge-fail">{p.failed}</span>}
        </button>
        <button className="cart-btn" onClick={p.onCart} aria-label={`Cart, ${p.cartCount} parts`}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2EDE4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 2.5h2.2l1.6 8.2h8.2l1.5-5.7H4.4" /><circle cx="6.5" cy="14.5" r="1.1" fill="#F2EDE4" /><circle cx="12.5" cy="14.5" r="1.1" fill="#F2EDE4" />
          </svg>
          {p.cartCount > 0 && <span className="cart-count">{p.cartCount}</span>}
        </button>
      </div>
    </div>
  );
}

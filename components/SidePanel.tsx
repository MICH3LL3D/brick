import type { Design, Part } from "@/lib/contracts";
import type { DerivedT } from "@/lib/stub";

export type PanelTab = "buy" | "checks";

export function SidePanel(p: {
  tab: PanelTab; onTab: (t: PanelTab) => void;
  parts: Part[]; design: Design; derived: DerivedT;
  selectedId: string | null; onSelect: (id: string) => void;
  onCsv: () => void; onKit: () => void; kitNote: string;
}) {
  const failed = p.derived.checks.filter((c) => !c.ok).length;
  return (
    <aside className="panel" aria-label="Buy list and checks">
      <div className="ptabs">
        <button className={`ptab${p.tab === "buy" ? " on" : ""}`} onClick={() => p.onTab("buy")}>Buy list</button>
        <button className={`ptab${p.tab === "checks" ? " on" : ""}`} onClick={() => p.onTab("checks")}>
          Checks {failed > 0 && <span className="badge-fail">{failed} failed</span>}
        </button>
      </div>
      <div className="list">
        {p.tab === "buy"
          ? p.parts.map((pt) => (
              <button key={pt.id} className={`row${p.selectedId === pt.id ? " on" : ""}`} onClick={() => p.onSelect(pt.id)}>
                <div className="grow"><b>{pt.name}</b><span>{p.design.reasons[pt.id]}</span></div>
                <div className="price">
                  <span>${pt.priceUsd}</span>
                  <span className={pt.verified ? "verified" : "unverified"}>{pt.verified ? "Verified" : "Unverified"}</span>
                </div>
              </button>
            ))
          : p.derived.checks.map((c) => (
              <div key={c.id} className="row check-row">
                <span className={`check-mark ${c.ok ? "ok" : "fail"}`}>{c.ok ? "✓" : "✕"}</span>
                <div className="grow"><span style={{ color: c.ok ? "var(--muted)" : "var(--text)" }}>{c.message}</span></div>
              </div>
            ))}
      </div>
      <div className="foot">
        <div><small>Total</small><strong>${p.derived.totalUsd}</strong></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-line" onClick={p.onCsv}>CSV</button>
          <button className="btn-line accent" onClick={p.onKit}>Download kit</button>
        </div>
      </div>
      <p className="note-line">{p.kitNote || "Prices from vendor pages at scrape time."}</p>
    </aside>
  );
}

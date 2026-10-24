import type { Design, Part } from "@/lib/contracts";

export type CartRobot = { id: string; name: string; design: Design; parts: Part[] };

export function CartDrawer(p: { robots: CartRobot[]; onClose: () => void; onKits: () => void; onCsv: () => void; busy: boolean; note: string }) {
  const sum = (r: CartRobot) => r.parts.reduce((s, x) => s + x.priceUsd, 0);
  const total = p.robots.reduce((s, r) => s + sum(r), 0);
  const count = p.robots.reduce((s, r) => s + r.parts.length, 0);
  return (
    <>
      <div className="scrim" onClick={p.onClose} />
      <aside className="drawer" aria-label="Cart">
        <header>
          <h2>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>Cart <small>{String(count).padStart(2, "0")}</small></span>
            <button onClick={p.onClose} aria-label="Close cart">✕</button>
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Parts from all your robots</p>
        </header>
        <div className="scroll">
          {p.robots.length === 0 && <p className="muted" style={{ padding: "16px 24px" }}>Nothing yet. Generate a robot to fill your cart.</p>}
          {p.robots.map((r) => (
            <section className="group" key={r.id}>
              <div className="group-head"><b>{r.name}</b><span>${sum(r)} · {r.parts.length} parts</span></div>
              {r.parts.map((x) => (
                <div className="line" key={x.id}>
                  <div>{x.name}<small>{x.vendor}</small></div>
                  <span className="p">${x.priceUsd}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer>
          <div className="tot"><span className="muted">Total</span><span>${total}</span></div>
          <p>{p.note || "Prices from vendor pages at scrape time. Excludes shipping and tax."}</p>
          <button className="btn-pill" disabled={p.busy || !p.robots.length} onClick={p.onKits}>
            Download {p.robots.length} kit{p.robots.length === 1 ? "" : "s"}<span>${total} →</span>
          </button>
          <button className="btn-ghost" disabled={!p.robots.length} onClick={p.onCsv}>Export CSV</button>
        </footer>
      </aside>
    </>
  );
}

import type { Part } from "@/lib/contracts";
import { sumUsd, usd } from "@/lib/money";

const Thumb = ({ category }: { category: Part["category"] }) =>
  category === "arm" ? <div style={{ width: 4, height: 30, borderRadius: 2, background: "var(--muted)" }} />
  : category === "controller" ? <div style={{ width: 26, height: 20, borderRadius: 3, border: "1.5px solid var(--muted)" }} />
  : <div style={{ width: 30, height: 16, borderRadius: 4, border: "1.5px solid var(--muted)" }} />;

export function CartDrawer(p: { name: string; parts: Part[]; budgetUsd: number; onClose: () => void; onKit: () => void; onCsv: () => void; busy: boolean; note: string }) {
  const sub = sumUsd(p.parts.map((x) => x.priceUsd));
  const left = sumUsd([p.budgetUsd, -sub]);
  return (
    <>
      <div className="scrim" onClick={p.onClose} />
      <aside className="drawer" aria-label="Cart">
        <header>
          <h2>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>Cart <small>{String(p.parts.length).padStart(2, "0")}</small></span>
            <button onClick={p.onClose} aria-label="Close cart">✕</button>
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{p.name ? `Parts for ${p.name}` : "Your cart is empty"}</p>
        </header>
        <div className="scroll">
          <div className="items">
            {p.parts.map((x) => (
              <div className="item-row" key={x.id}>
                <div className="thumb"><Thumb category={x.category} /></div>
                <div className="info">
                  <b>{x.name}</b>
                  <small>{x.vendor} · {x.verified ? "Verified" : "Unverified"}</small>
                  <div><span className="p">{usd(x.priceUsd)}</span>{x.url.startsWith("https://") && <a href={x.url} target="_blank" rel="noopener noreferrer">Listing ↗</a>}</div>
                </div>
              </div>
            ))}
          </div>
          {p.parts.length > 0 && (
            <div className="sums">
              <div><span>Subtotal</span><span>{usd(sub)}</span></div>
              <div><span>Budget</span><span>{usd(p.budgetUsd)} · {left >= 0 ? `${usd(left)} left` : `${usd(-left)} over`}</span></div>
              <div className="bar"><i style={{ width: `${Math.min(100, (sub / p.budgetUsd) * 100)}%`, background: left >= 0 ? undefined : "var(--fail)" }} /></div>
              <p>{p.note || "Prices from vendor pages at scrape time. Excludes shipping and tax. Kit not yet tested on hardware."}</p>
            </div>
          )}
        </div>
        <footer>
          <button className="btn-pill" disabled={p.busy || !p.parts.length} onClick={p.onKit}>Download kit<span>{usd(sub)} →</span></button>
          <button className="btn-ghost" disabled={!p.parts.length} onClick={p.onCsv}>Export CSV</button>
        </footer>
      </aside>
    </>
  );
}

import { bookMeta, BOOKS, type IconNameT, type ManualPageT } from "@/lib/manual-format";
import { Illustration } from "./PartArt";
import { WiringDiagram } from "./WiringDiagram";

const WIRE: Record<string, string> = { red: "#D94F41", black: "#222B26", orange: "#E8813A", blue: "#4179C7", yellow: "#E4B73A", white: "#FFFFFF", green: "#3E9E63", purple: "#865BB4", brown: "#774A28", grey: "#A9A9A0" };

type Art = { kind: "photo"; src: string; credit?: string } | { kind: "part"; partId: string } | { kind: "icon"; name: IconNameT } | undefined;

// Photo when one was verified, otherwise a drawing of the part or action, so no slot is empty. Drawings carry a small caption.
const ArtBox = ({ art, label }: { art?: Art; label?: string }) =>
  art?.kind === "photo"
    // eslint-disable-next-line @next/next/no-img-element
    ? <><img className="m-photo" referrerPolicy="no-referrer" src={art.src} alt={label ?? ""} />{art.credit && <small className="m-credit">{art.credit}</small>}</>
    : art ? <div className="m-art"><Illustration partId={art.kind === "part" ? art.partId : undefined} icon={art.kind === "icon" ? art.name : undefined} label={label} /><small className="m-credit">{art.kind === "part" ? "Drawing, not a photo of your exact part" : "Illustration"}</small></div>
    : <div className="m-art">{label ?? "Diagram"}</div>;

const SeeTag = ({ r, onOpen }: { r: { book: ManualPageT["book"]; page: number; label: string }; onOpen: (book: ManualPageT["book"], page: number) => void }) => (
  <button className="m-see" style={{ background: bookMeta(r.book).color }} onClick={() => onOpen(r.book, r.page)}>
    SEE {bookMeta(r.book).name} · p.{r.page} · {r.label}
  </button>
);

export function ManualPage({ page, total, onOpen }: { page: ManualPageT; total: number; onOpen: (book: ManualPageT["book"], page: number) => void }) {
  const meta = bookMeta(page.book);
  const intro = page.book === "0";
  return (
    <article className="mpage">
      {!intro && <span className="m-badge" style={{ background: meta.color }}>MANUAL {page.book} · {meta.name.toUpperCase()}</span>}
      <div className="m-top">
        {!intro && <div className="m-num">{page.page}</div>}
        {intro && <h2 className="m-h1">{page.title}</h2>}
        {page.parts.length > 0 && (
          <div className="m-partsbox">
            {page.parts.map((p) => <div key={p.label}><b>{p.qty}x</b>{p.art?.kind === "photo" && /* eslint-disable-next-line @next/next/no-img-element */ <img className="m-thumb" src={p.art.src} alt="" />}{p.art && p.art.kind !== "photo" && <span className="m-thumb"><Illustration partId={p.art.kind === "part" ? p.art.partId : undefined} icon={p.art.kind === "icon" ? p.art.name : undefined} /></span>}<span>{p.label}</span></div>)}
          </div>
        )}
      </div>
      {intro && page.kind !== "legend" && <p className="m-sub">{page.blurb}</p>}

      {(page.kind === "steps" || page.kind === "skill") && (
        <div className="m-panels">
          {page.panels.map((pn, i) => (
            <div className="m-panel" key={pn.title}>
              <h4><i>{i + 1}</i>{pn.title}</h4>
              <ArtBox art={pn.art} label={pn.title} />
              {pn.caption && <p>{pn.caption}</p>}
            </div>
          ))}
        </div>
      )}
      {page.kind === "steps" && page.footer && <p className="m-footer-note">{page.footer}</p>}
      {page.kind === "steps" && page.photoCredit && <small className="m-credit">{page.photoCredit}</small>}

      {page.kind === "wiring" && (
        <>
          {page.wires.some((w) => w.a && w.b) ? <WiringDiagram wires={page.wires} /> : (
            <>
              {page.photo ? <ArtBox art={{ kind: "photo", src: page.photo.src, credit: page.photo.credit }} label="Board" /> : <ArtBox art={{ kind: "icon", name: page.gauge ? "multimeter" : "wire" }} label="Wiring" />}
              <ul className="m-wires">
                {page.wires.map((w) => (
                  <li key={`${w.from}${w.to}`} style={{ opacity: w.isNew ? 1 : 0.45 }}>
                    <i style={{ background: WIRE[w.color], borderColor: w.color === "white" ? "#222B26" : WIRE[w.color] }} />{w.from} → {w.to}
                  </li>
                ))}
              </ul>
            </>
          )}
          {page.gauge && <div className="m-gauge"><b>{page.gauge.reading}</b><span>{page.gauge.expect}</span></div>}
        </>
      )}

      {page.kind === "fix" && (
        <div className="m-fix">
          {page.rows.map((r) => (
            <div key={r.symptom}>
              <h4>{r.symptom}</h4><p>{r.advice}</p>
              <div>{r.see.map((s) => <SeeTag key={`${s.book}${s.page}`} r={s} onOpen={onOpen} />)}</div>
            </div>
          ))}
        </div>
      )}

      {page.kind === "shelf" && (
        <>
          <div className="m-shelf">
            {BOOKS.filter((b) => b.id !== "0").map((b) => (
              <div key={b.id} style={{ background: b.color }}><b>{b.id}</b><span>{b.name}</span></div>
            ))}
          </div>
          <p className="m-note">{page.note}</p>
        </>
      )}

      {page.kind === "parts" && (
        <>
          <div className="m-grid">{page.items.map((p) => <div key={p.label}><ArtBox art={p.art} label={p.label} /><b>{p.qty}x {p.label}</b></div>)}</div>
          <p className="m-note">Also: {page.also}</p><p className="m-note">Tools: {page.tools}</p>
          <p className="m-note">{page.wireCounts.map((w) => `${w.color} ${w.count}x`).join(" · ")}</p>
        </>
      )}

      {page.kind === "legend" && (
        <ul className="m-legend">
          {[["New parts glow", "A yellow dashed outline marks the part you add on this page."], ["New wires glow", "Wires from earlier pages are faded. Only glowing wires are new."], ["Parts box", "Top of each page: exactly what you need for this page."], ["Warning", "Red triangle means keep the battery unplugged while you work."], ["See another book", "A coloured tag points to the page that teaches that skill."], ["Pin numbers", "Always count pins by this number. Not by the GPIO name."]].map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
        </ul>
      )}

      {!intro && <div className="m-text"><h3>{page.title}</h3><p>{page.blurb}</p></div>}
      {page.kind !== "fix" && page.see.length > 0 && <div className="m-sees">{page.see.map((s) => <SeeTag key={`${s.book}${s.page}`} r={s} onOpen={onOpen} />)}</div>}
      {page.warning && <div className="m-warn">▲ {page.warning}</div>}
      <footer>
        <span className="m-dots">{Array.from({ length: total }, (_, i) => <i key={i} style={{ background: i < page.page ? meta.color : undefined }} />)}</span>
        <span>{intro ? "" : `Manual ${page.book} · `}page {page.page} of {total}</span>
      </footer>
    </article>
  );
}

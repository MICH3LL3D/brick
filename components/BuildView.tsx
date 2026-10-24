"use client";

import { useMemo, useState } from "react";
import type { Design } from "@/lib/contracts";
import { bookMeta, type BookIdT, type ManualSetT } from "@/lib/manual-format";
import { BRAND } from "@/lib/brand";
import { Wordmark } from "./Logo";
import { ManualPage } from "./ManualPage";
import { ModeSwitch, type Mode } from "./ModeSwitch";
import { SprocketChat } from "./SprocketChat";

type Pos = { book: BookIdT; page: number };
const KEY = `${BRAND}-manual-done`;

export function BuildView({ manuals, status = "", design, prompt, onMode }: { manuals: ManualSetT; status?: string; design: Design | null; prompt: string; onMode: (m: Mode) => void }) {
  const [pos, setPos] = useState<Pos>({ book: "0", page: 1 });
  const [from, setFrom] = useState<Pos | null>(null); // where a SEE tag was opened from
  // BuildView only mounts client-side (after the mode switch), so localStorage is safe in the initialiser.
  const [done, setDone] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { return new Set(); }
  });
  const [listOpen, setListOpen] = useState(false);

  const mark = (s: Set<string>) => { setDone(s); try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ } };

  const book = manuals.books.find((b) => b.id === pos.book)!;
  const page = book.pages[pos.page - 1];
  const all = useMemo(() => manuals.books.flatMap((b) => b.pages.map((p) => `${b.id}.${p.page}`)), [manuals]);
  const doneCount = all.filter((k) => done.has(k)).length;
  const meta = bookMeta(pos.book);
  const where = `Book ${pos.book}, page ${pos.page}`;

  const open = (b: BookIdT, p: number) => {
    if (b === "S" && pos.book !== "S") setFrom(pos);
    else if (b !== "S") setFrom(null);
    setPos({ book: b, page: p }); setListOpen(false);
  };
  const next = () => {
    mark(new Set(done).add(`${pos.book}.${pos.page}`));
    if (pos.page < book.pages.length) return setPos({ ...pos, page: pos.page + 1 });
    const i = manuals.books.findIndex((b) => b.id === pos.book);
    const nb = manuals.books[i + 1];
    if (nb) setPos({ book: nb.id, page: 1 });
  };
  const back = () => {
    if (pos.page > 1) return setPos({ ...pos, page: pos.page - 1 });
    const i = manuals.books.findIndex((b) => b.id === pos.book);
    const pb = manuals.books[i - 1];
    if (pb) setPos({ book: pb.id, page: pb.pages.length });
  };
  const skillSee = page.see.find((s) => s.book === "S");
  const inSkill = pos.book === "S" && from;

  return (
    <div className="build">
      <header className="b-top">
        <div className="l"><Wordmark /><ModeSwitch mode="build" onMode={onMode} /></div>
        <div className="r">
          <span>{doneCount} of {all.length} pages done</span>
          <i className="bar"><i style={{ width: `${(doneCount / all.length) * 100}%` }} /></i>
        </div>
      </header>
      <div className="b-body">
        <nav className={`b-list${listOpen ? " open" : ""}`} aria-label="Manuals">
          <h4>MANUALS</h4>
          {manuals.books.map((b) => {
            const n = b.pages.filter((p) => done.has(`${b.id}.${p.page}`)).length;
            const info = b.id === "10" || b.id === "S" ? (b.id === "S" && inSkill ? "open" : `${b.pages.length} pages`) : `${n}/${b.pages.length}`;
            const cls = b.id === pos.book ? "on" : from?.book === b.id ? "from" : "";
            return (
              <button key={b.id} className={cls} onClick={() => open(b.id, 1)}>
                <span className={n === b.pages.length && b.id !== "10" && b.id !== "S" ? "ok" : undefined}>{b.id}</span>
                <b>{b.name}</b>
                <small className={n === b.pages.length && b.id !== "10" && b.id !== "S" ? "ok" : undefined}>{info}</small>
              </button>
            );
          })}
        </nav>
        <main className="b-view">
          <button className="b-chip" onClick={() => setListOpen(!listOpen)}>{pos.book} · {book.name}<small>page {pos.page} of {book.pages.length}</small></button>
          {inSkill ? (
            <div className="b-head">
              <button className="b-return" onClick={() => { setPos(from!); setFrom(null); }}>← Back to Book {from!.book} · page {from!.page}</button>
              <span>Skills · page {pos.page} of {book.pages.length}</span>
            </div>
          ) : (
            <div className="b-head"><h2>{pos.book === "0" ? book.name : `Book ${pos.book} · ${book.name}`} · {page.title}</h2><span>page {pos.page} of {book.pages.length}</span></div>
          )}
          {inSkill && <h2 className="b-title">Skills · {page.title}</h2>}
          {!inSkill && page.warning && <div className="b-warn">▲ {page.warning}</div>}
          {status && <div className="b-note" role="status" aria-live="polite">{status}</div>}
          {manuals.source === "sample" && !status && <div className="b-warn">Sample manual, not built from your robot. The build kit is untested on hardware.</div>}
          <ManualPage page={page} total={book.pages.length} onOpen={open} />
          <div className="b-actions">
            {inSkill ? (
              <button className="sage" onClick={() => { setPos(from!); setFrom(null); }}>Got it, back to the build</button>
            ) : (
              <>
                <button onClick={back}>Back</button>
                {skillSee && <button onClick={() => open("S", skillSee.page)}>Open Skills: {skillSee.label.toLowerCase()}</button>}
                <button className="sage" onClick={next}>Done, next page</button>
              </>
            )}
          </div>
        </main>
        <SprocketChat where={inSkill ? `Skills · ${page.title}` : where} design={design} prompt={prompt} />
      </div>
      <span hidden style={{ color: meta.color }} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { Design, Task } from "@/lib/contracts";
import { askOwl, type ChatActionT, type OwlMsg } from "@/lib/api";
import { Brick } from "./Logo";

type Item = OwlMsg | { role: "note"; content: string };
type TaskT = z.infer<typeof Task>;

const CHIPS = ["Why this arm?", "Explain the failed checks", "Make it cheaper", "Swap to a stronger motor"];
const GREETING = "Hoo! Confused by a part, or want a small tweak? Ask me.";
const OFFLINE = "I can't reach my brain right now. Try again in a moment.";

const Dots = () => <span className="owl-dots" aria-hidden><i /><i /><i /></span>;

export function OwlChat({ robotKey, design, task, onAction, right = 28 }: {
  robotKey: string;
  design: Design; task: TaskT;
  onAction: (a: ChatActionT) => Promise<string>;
  right?: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(robotKey);
  const gen = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  if (key !== robotKey) { setKey(robotKey); setItems([]); setBusy(false); setText(""); }
  useEffect(() => { gen.current++; }, [robotKey]);

  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [items, busy, open]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    const g = gen.current;
    const next: Item[] = [...items, { role: "user", content: t.trim() }];
    setItems(next); setText(""); setBusy(true);
    const history = next.filter((m): m is OwlMsg => m.role !== "note");
    let res: Awaited<ReturnType<typeof askOwl>> | null = null;
    try { res = await askOwl(history, design, task); } catch { res = null; }
    if (g !== gen.current) return;
    setItems((cur) => [...cur, { role: "assistant", content: res?.reply || OFFLINE }]);
    for (const a of res?.actions ?? []) {
      let note: string;
      try { note = `✓ ${await onAction(a)}`; } catch { note = "Couldn't apply that change"; }
      if (g !== gen.current) return;
      setItems((cur) => [...cur, { role: "note", content: note }]);
    }
    setBusy(false);
  };

  return (
    <div className={`owl-chat${open ? " open" : ""}`} style={{ right }}>
      <button className="owl-launch" onClick={() => setOpen(true)} aria-label="Ask the owl" aria-expanded={open} tabIndex={open ? -1 : 0}>
        <span className="owl-hint"><Dots /></span>
        <Brick size={56} blink />
      </button>

      <section className="owl-panel" role="dialog" aria-label="Owl chat" aria-hidden={!open} inert={!open}>
        <header>
          <Brick size={32} />
          <div><b>Brick</b><small>Ask about your design or request a small change</small></div>
          <button className="owl-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>
        <div className="owl-log" aria-live="polite">
          <div className="owl-row"><Brick size={24} /><p className="owl-bubble">{GREETING}</p></div>
          {items.map((m, i) =>
            m.role === "note" ? <p key={i} className="owl-note">{m.content}</p>
            : m.role === "user" ? <p key={i} className="owl-bubble user">{m.content}</p>
            : <div key={i} className="owl-row"><Brick size={24} /><p className="owl-bubble">{m.content}</p></div>
          )}
          {busy && <div className="owl-row"><Brick size={24} /><p className="owl-bubble" aria-label="Brick is typing"><Dots /></p></div>}
          {!items.length && <div className="owl-chips">{CHIPS.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Brick" aria-label="Message Brick" />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()}>↑</button>
        </form>
        <small className="owl-foot">Answers by Gemini · may be wrong</small>
      </section>
    </div>
  );
}

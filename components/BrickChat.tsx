"use client";

import { useRef, useState } from "react";
import type { Design } from "@/lib/contracts";
import { askBrick } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };
const CHIPS = ["Is this wire right?", "Something smells hot"];

export function BrickChat({ where, design, prompt }: { where: string; design: Design | null; prompt: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); // narrow screens: bottom sheet
  const end = useRef<HTMLDivElement>(null);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t.trim() }];
    setMsgs(next); setText(""); setBusy(true); setOpen(true);
    // The server chat has no page context field yet, so the reader's place rides on the last user message.
    const withPlace = next.map((m, i) => (i === next.length - 1 ? { ...m, content: `[Reader is on ${where}] ${m.content}` } : m));
    const reply = await askBrick(withPlace, design, prompt);
    setMsgs([...next, { role: "assistant", content: reply }]);
    setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  return (
    <aside className={`chat${open ? " open" : ""}`} aria-label="Brick chat">
      <header onClick={() => setOpen(!open)}>
        <span className="avatar">S</span>
        <div><b>Brick</b><small>Knows where you are: {where}</small></div>
      </header>
      <div className="chat-log">
        {msgs.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}
        {busy && <p className="assistant">…</p>}
        <div ref={end} />
      </div>
      <div className="chat-foot">
        <div className="chips">{CHIPS.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this page" aria-label="Ask Brick" />
          <button type="submit" aria-label="Send" disabled={busy}>→</button>
        </form>
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import { usd } from "@/lib/money";

export type HistoryItem = { id: string; name: string; totalUsd: number; parts: number };

export function HistorySidebar(p: { open: boolean; items: HistoryItem[]; currentId: string | null; onPick: (id: string) => void; onNew: () => void; onRename: (id: string, name: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const done = (save: boolean) => {
    if (save && editing && draft.trim()) p.onRename(editing, draft.trim());
    setEditing(null);
  };
  return (
    <div className={`history-wrap${p.open ? " open" : ""}`}>
    <nav className="history" aria-label="Robot history" inert={!p.open}>
      <button className="new-robot" onClick={p.onNew}><span>+</span><span>New robot</span></button>
      {p.items.length > 0 && <h4>Today</h4>}
      {p.items.map((r) => (
        <div
          key={r.id} role="button" tabIndex={0}
          className={`history-item${r.id === p.currentId ? " on" : ""}${editing === r.id ? " editing" : ""}`}
          onClick={() => p.onPick(r.id)}
          onDoubleClick={() => { setEditing(r.id); setDraft(r.name); }}
          onKeyDown={(e) => { if (e.key === "Enter" && editing !== r.id) p.onPick(r.id); }}
        >
          {editing === r.id ? (
            <input
              autoFocus maxLength={60} value={draft} aria-label="Rename robot"
              onChange={(e) => setDraft(e.target.value)} onBlur={() => done(true)} onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }}
            />
          ) : r.name}
          <small><b>{usd(r.totalUsd)}</b> · {r.parts} parts</small>
        </div>
      ))}
    </nav>
    </div>
  );
}

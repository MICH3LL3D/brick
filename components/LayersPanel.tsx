import { useState } from "react";

export type Layers = { shell: boolean; parts: boolean; wiring: boolean; frame: boolean };
export const ALL_LAYERS: Layers = { shell: true, parts: true, wiring: true, frame: true };
const NAMES: [keyof Layers, string][] = [["shell", "Shell"], ["parts", "Parts"], ["wiring", "Wiring"], ["frame", "Frame"]];

const Eye = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeWidth="1.4" aria-hidden>
    <path d="M1.5 8 C3.5 4.5 12.5 4.5 14.5 8 C12.5 11.5 3.5 11.5 1.5 8 Z" stroke={on ? "#2B6FC2" : "#5E574D"} opacity={on ? 1 : 0.5} />
    {on ? <circle cx="8" cy="8" r="2" fill="#2B6FC2" /> : <path d="M2 14 L14 2" stroke="#5E574D" opacity=".5" />}
  </svg>
);

export function LayersPanel(p: { name: string; onName: (s: string) => void; layers: Layers; onLayers: (l: Layers) => void }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const finish = (save: boolean) => {
    if (save && draft.trim()) p.onName(draft.trim());
    setEditing(false);
  };
  const shown = Object.values(p.layers).filter(Boolean).length;
  return (
    <div className="layers">
      {open && (editing ? (
        <div className="rename">
          <input
            autoFocus maxLength={60} value={draft} aria-label="Robot name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); }}
          />
          <small>Enter to save · Esc to cancel</small>
        </div>
      ) : (
        <button className="title" onClick={() => { setDraft(p.name); setEditing(true); }} title="Click to rename">
          <span>{p.name}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
            <path d="M1.5 12.5l.7-3L9.6 2.1a1.4 1.4 0 012 2L4.2 11.5l-2.7 1z" />
          </svg>
        </button>
      ))}
      <div className="head">
        <button className="fold" onClick={() => setOpen(!open)} aria-expanded={open}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#5E574D" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? undefined : "rotate(-90deg)" }}><path d="M3 4.5 L6 7.5 L9 4.5" /></svg>
          LAYERS{!open && <span style={{ color: "#2B6FC2" }}>{shown}/4</span>}
        </button>
        {open && <button className={shown < 4 ? "accent" : undefined} onClick={() => p.onLayers(ALL_LAYERS)}>Reset</button>}
      </div>
      {open && NAMES.map(([k, label]) => (
        <button key={k} className={`layer-row${p.layers[k] ? "" : " off"}`} onClick={() => p.onLayers({ ...p.layers, [k]: !p.layers[k] })} aria-pressed={p.layers[k]}>
          <Eye on={p.layers[k]} />{label}
        </button>
      ))}
    </div>
  );
}

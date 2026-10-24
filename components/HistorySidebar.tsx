export type HistoryItem = { id: string; name: string; totalUsd: number; parts: number };

export function HistorySidebar(p: { items: HistoryItem[]; currentId: string | null; onPick: (id: string) => void; onNew: () => void }) {
  return (
    <nav className="history" aria-label="Robot history">
      <button className="new-robot" onClick={p.onNew}><span>+</span><span>New robot</span></button>
      {p.items.length > 0 && <h4>This session</h4>}
      {p.items.map((r) => (
        <button key={r.id} className={`history-item${r.id === p.currentId ? " on" : ""}`} onClick={() => p.onPick(r.id)}>
          {r.name}
          <small><b>${r.totalUsd}</b> · {r.parts} parts</small>
        </button>
      ))}
    </nav>
  );
}

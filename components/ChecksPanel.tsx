import type { DerivedT } from "@/lib/stub";

export function ChecksPanel({ derived, onLimits }: { derived: DerivedT; onLimits: () => void }) {
  const failed = derived.checks.filter((c) => !c.ok).length;
  return (
    <aside className="panel" aria-label="Checks">
      <div className="ptabs">
        <span className="ptab on">Checks {failed > 0 && <span className="badge-fail">{failed} failed</span>}</span>
      </div>
      <div className="list">
        {derived.checks.map((c) => (
          <div key={c.id} className="row check-row">
            <span className={`check-mark ${c.ok ? "ok" : "fail"}`}>{c.ok ? "✓" : "✕"}</span>
            <div className="grow"><span style={{ color: c.ok ? "var(--muted)" : "var(--text)" }}>{c.message}</span></div>
          </div>
        ))}
      </div>
      <button className="note-line" style={{ textAlign: "left", color: "var(--blue)" }} onClick={onLimits}>Limitations</button>
    </aside>
  );
}

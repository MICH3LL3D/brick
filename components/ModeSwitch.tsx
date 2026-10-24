export type Mode = "design" | "build";

export function ModeSwitch({ mode, onMode, canBuild = true }: { mode: Mode; onMode: (m: Mode) => void; canBuild?: boolean }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Mode">
      {(["design", "build"] as const).map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : undefined} disabled={m === "build" && !canBuild} title={m === "build" && !canBuild ? "Design a robot first" : undefined} onClick={() => onMode(m)}>
          {m === "design" ? "Design" : "Build"}
        </button>
      ))}
    </div>
  );
}

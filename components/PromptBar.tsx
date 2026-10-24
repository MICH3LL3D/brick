import { BudgetSlider } from "./BudgetSlider";

export const EXAMPLES = ["Water my plants", "Bring my water bottle to the couch", "Photograph the windows"];

export function PromptBar(p: { prompt: string; onPrompt: (s: string) => void; budget: number; onBudget: (n: number) => void; busy: boolean; hasRobot: boolean; onGenerate: () => void }) {
  return (
    <>
      {!p.hasRobot && (
        <div className="try">
          <span>Try</span>
          {EXAMPLES.map((ex) => <button key={ex} onClick={() => p.onPrompt(ex)}>{ex}</button>)}
        </div>
      )}
      <form className="promptbar" onSubmit={(e) => { e.preventDefault(); p.onGenerate(); }}>
        <input className="prompt" value={p.prompt} onChange={(e) => p.onPrompt(e.target.value)} placeholder="Describe a task" aria-label="Describe a task" />
        <span className="vr" />
        <div className="budget">
          <label htmlFor="pb">Budget</label>
          <BudgetSlider id="pb" value={p.budget} onChange={p.onBudget} />
          <output htmlFor="pb">${p.budget}</output>
        </div>
        <span className="vr" />
        <button className="btn-gold" type="submit" disabled={p.busy || !p.prompt.trim()}>{p.busy ? "Generating…" : "Generate"}</button>
      </form>
    </>
  );
}

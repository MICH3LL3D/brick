"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brick, Wordmark } from "./Logo";
import { BudgetSlider } from "./BudgetSlider";

export function Landing() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState(240);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams({ budget: String(budget) });
    if (prompt.trim()) q.set("prompt", prompt.trim());
    router.push(`/playground?${q}`);
  };

  return (
    <div className="land">
      <header>
        <div className="logo"><Brick size={36} /><Wordmark size={15} /></div>
        <Link className="btn-outline" href="/playground">Open playground</Link>
      </header>
      <main>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Brick size={64} blink />
          <h1>Build the robot you imagined.</h1>
          <p className="sub">No engineering experience needed.</p>
        </div>
        <form onSubmit={go}>
          <div className="bigbar">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Water my plants while I’m away" aria-label="Describe a task" />
            <button className="btn-gold" type="submit">Generate</button>
          </div>
          <div className="brow">
            <label htmlFor="budget">Budget</label>
            <BudgetSlider id="budget" value={budget} onChange={setBudget} width={200} />
            <output htmlFor="budget">${budget}</output>
          </div>
        </form>
      </main>
      <footer>
        <span>Made with Gemini</span><i />
        <span>Kit not yet tested on hardware</span><i />
        <span>Prices may change</span>
      </footer>
    </div>
  );
}

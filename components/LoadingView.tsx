"use client";

import { useEffect, useState } from "react";
import { Owl } from "./Logo";

const STEPS = ["Reading your task", "Picking parts from the catalog", "Checking pins, power and reach"];

/** `progress` is live text from the agents; with none (cached or offline demo) the generic steps play instead. */
export function LoadingView({ prompt, progress = [] }: { prompt: string; progress?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="center" role="status">
      <Owl size={140} blink />
      <h2>Designing your robot</h2>
      <p className="muted">{prompt}</p>
      {progress.length > 0 ? (
        <ul className="steps" aria-live="polite">
          {progress.slice(-8).map((line, n, shown) => (
            <li key={progress.length - shown.length + n} className={n === shown.length - 1 ? "now" : undefined}>
              {n < shown.length - 1 ? <span className="done">✓</span> : <span className="dot" />}{line}
            </li>
          ))}
        </ul>
      ) : (
      <ul className="steps">
        {STEPS.map((s, n) => (
          <li key={s} className={n === i ? "now" : undefined}>
            {n < i ? <span className="done">✓</span> : <span className="dot" />}{s}
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="center" role="alert">
      <Owl size={120} />
      <h2>Couldn’t design that robot</h2>
      <p className="muted">{message}</p>
      <button className="btn-gold" onClick={onRetry} style={{ marginTop: 16 }}>Try again</button>
    </div>
  );
}

export function EmptyView() {
  return (
    <div className="center">
      <Owl size={120} blink />
      <h2>What should your robot do?</h2>
      <p className="muted">Describe a task below, or try one of the examples.</p>
    </div>
  );
}

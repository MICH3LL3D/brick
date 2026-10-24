"use client";
// Picks the 3D scene or the 2D schematic. three.js loads only on the client, only when WebGL works,
// and a runtime error or lost WebGL context inside the scene drops back to 2D for that robot.
import dynamic from "next/dynamic";
import { Component, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { RobotPreview } from "../RobotPreview";
import type { SceneProps } from "./types";

const RobotScene = dynamic(() => import("./RobotScene").then((m) => m.RobotScene), {
  ssr: false,
  loading: () => <div className="viewer-loading mono" role="status">Loading 3D view…</div>,
});

let webgl: boolean | undefined;
const hasWebGL = () => {
  if (webgl === undefined) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
};
const noop = () => () => {};

class Fallback extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) {
    console.warn("3D viewer failed, showing 2D", e);
    this.props.onError();
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function Viewer(p: SceneProps) {
  const supported = useSyncExternalStore(noop, hasWebGL, () => null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  // A crash only disables 3D for the parts list it happened on; a new robot gets a fresh try.
  const sig = p.parts.map((x) => x.id).join(",");
  const [crashedSig, setCrashedSig] = useState<string | null>(null);
  const crashed = crashedSig === sig;
  const can3d = supported === true && !crashed;
  const show3d = can3d && mode === "3d";
  const box = useRef<HTMLDivElement>(null);
  const noteId = useId();

  // webglcontextlost doesn't bubble, but a capture listener on an ancestor still sees it.
  useEffect(() => {
    const el = box.current;
    if (!el || !show3d) return;
    const lost = () => setCrashedSig(sig);
    el.addEventListener("webglcontextlost", lost, true);
    return () => el.removeEventListener("webglcontextlost", lost, true);
  }, [show3d, sig]);

  const flat = (
    <RobotPreview parts={p.parts} layers={p.layers} selectedId={p.selectedId} onSelect={p.onSelect} />
  );

  return (
    <div className="viewer" ref={box}>
      {supported !== null && (
        <div className="view-toggle" role="group" aria-label="Viewer">
          {(["3d", "2d"] as const).map((m) => {
            const off = m === "3d" && !can3d;
            const on = (m === "3d") === show3d;
            return (
              <button
                key={m} type="button" aria-pressed={on} className={on ? "on" : ""}
                aria-disabled={off || undefined} aria-describedby={off ? noteId : undefined}
                onClick={() => { if (!off) setMode(m); }}
              >
                {m.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
      {supported !== null && !can3d && <p id={noteId} className="viewer-note" role="status">3D view unavailable — showing 2D</p>}
      {supported === null ? null : show3d ? (
        <Fallback key={sig} fallback={flat} onError={() => setCrashedSig(sig)}>
          <RobotScene parts={p.parts} layers={p.layers} selectedId={p.selectedId} onSelect={p.onSelect} />
        </Fallback>
      ) : flat}
    </div>
  );
}

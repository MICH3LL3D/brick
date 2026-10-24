"use client";
// Picks the 3D scene or the 2D schematic. three.js loads only on the client, only when WebGL works,
// and any runtime error inside the scene drops back to 2D.
import dynamic from "next/dynamic";
import { Component, useState, useSyncExternalStore, type ReactNode } from "react";
import { RobotPreview } from "../RobotPreview";
import type { Offsets, SceneProps } from "./types";

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

type Props = Omit<SceneProps, "offsets" | "onMove"> & {
  offsets2d: Offsets; offsets3d: Offsets;
  onMove2d: SceneProps["onMove"]; onMove3d: SceneProps["onMove"];
};

export function Viewer(p: Props) {
  const supported = useSyncExternalStore(noop, hasWebGL, () => null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [crashed, setCrashed] = useState(false);
  const can3d = supported === true && !crashed;
  const show3d = can3d && mode === "3d";

  const flat = (
    <RobotPreview parts={p.parts} layers={p.layers} selectedId={p.selectedId} offsets={p.offsets2d} onSelect={p.onSelect} onMove={p.onMove2d} />
  );

  return (
    <div className="viewer">
      {supported !== null && (
        <div className="view-toggle" role="group" aria-label="Viewer">
          {(["3d", "2d"] as const).map((m) => (
            <button
              key={m} type="button" aria-pressed={(m === "3d") === show3d} className={(m === "3d") === show3d ? "on" : ""}
              disabled={m === "3d" && !can3d} title={m === "3d" && !can3d ? "3D isn’t available in this browser" : undefined}
              onClick={() => setMode(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {supported === null ? null : show3d ? (
        <Fallback fallback={flat} onError={() => setCrashed(true)}>
          <RobotScene parts={p.parts} layers={p.layers} selectedId={p.selectedId} offsets={p.offsets3d} onSelect={p.onSelect} onMove={p.onMove3d} />
        </Fallback>
      ) : flat}
    </div>
  );
}

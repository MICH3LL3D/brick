"use client";
// Dev-only preview of the 3D viewer with the 3 cached demo designs. Not linked from the app.
import { useMemo, useState } from "react";
import bottle from "../../../data/cache/bring-my-water-bottle-from-the-desk-to-the-couch.json";
import patrol from "../../../data/cache/patrol-the-apartment-and-take-photos-of-the-windows.json";
import water from "../../../data/cache/water-my-plants.json";
import { ALL_LAYERS, type Layers } from "@/components/LayersPanel";
import { RobotScene } from "@/components/robot3d/RobotScene";
import { loadCatalog } from "@/lib/data";

const DEMOS = { water, bottle, patrol };

export default function Robot3dDev() {
  const catalog = useMemo(() => loadCatalog(), []);
  const [demo, setDemo] = useState<keyof typeof DEMOS>("water");
  const [selected, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS);
  const parts = useMemo(
    () => DEMOS[demo].design.partIds.map((id) => catalog.find((p) => p.id === id)!).filter(Boolean),
    [demo, catalog],
  );
  return (
    <main style={{ padding: 16, color: "#F2EDE4", background: "#0B0A09", minHeight: "100vh", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {(Object.keys(DEMOS) as (keyof typeof DEMOS)[]).map((k) => (
          <button key={k} onClick={() => { setDemo(k); setSelected(null); }} aria-pressed={demo === k}>{k}</button>
        ))}
        {(Object.keys(layers) as (keyof Layers)[]).map((k) => (
          <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {k}</label>
        ))}
        <span>selected: {selected ?? "none"}</span>
      </div>
      <div style={{ height: "75vh" }}>
        <RobotScene parts={parts} layers={layers} selectedId={selected} onSelect={setSelected} />
      </div>
    </main>
  );
}

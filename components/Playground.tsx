"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Part } from "@/lib/contracts";
import { downloadKit, exportCsv, generate, getCatalog, getRoom, rebudget } from "@/lib/api";
import { STUB_CATALOG, STUB_ROOM, type Result } from "@/lib/stub";
import { CartDrawer } from "./CartDrawer";
import { HistorySidebar } from "./HistorySidebar";
import { ALL_LAYERS, LayersPanel, type Layers } from "./LayersPanel";
import { EmptyView, LoadingView } from "./LoadingView";
import { PartCard } from "./PartCard";
import { PromptBar } from "./PromptBar";
import { RobotPreview, type Offsets } from "./RobotPreview";
import { ChecksPanel } from "./ChecksPanel";
import { SimView } from "./SimView";
import { TopBar, type Tab } from "./TopBar";

type Robot = Result & { id: string; name: string; prompt: string; offsets: Offsets; cart: string[] };
type Undo = { robotId: string; partId: string };

const titleOf = (prompt: string) => {
  const t = prompt.trim().split(/\s+/).slice(0, 3).join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function Playground({ initialPrompt, initialBudget }: { initialPrompt: string; initialBudget: number }) {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState(initialBudget);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<Part[]>(STUB_CATALOG);
  const [room, setRoom] = useState(STUB_ROOM);
  const [tab, setTab] = useState<Tab>("robot");
  const [checksOpen, setChecksOpen] = useState(false);
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [note, setNote] = useState("");
  const [kitBusy, setKitBusy] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const budgetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(false);

  const current = robots.find((r) => r.id === currentId) ?? null;
  const partsOf = useCallback((ids: string[]) => ids.map((i) => catalog.find((p) => p.id === i)).filter((p): p is Part => !!p), [catalog]);
  const parts = useMemo(() => (current ? partsOf(current.design.partIds) : []), [current, partsOf]);
  const totalOf = (ids: string[]) => partsOf(ids).reduce((s, p) => s + p.priceUsd, 0);

  const patch = (id: string, f: (r: Robot) => Robot) => setRobots((rs) => rs.map((r) => (r.id === id ? f(r) : r)));

  const run = useCallback(async (text: string, b: number) => {
    setBusy(true);
    setSelectedId(null);
    setCurrentId(null);
    const res = await generate(text, b);
    const id = crypto.randomUUID();
    setRobots((rs) => [...rs, { ...res, id, name: titleOf(text), prompt: text, offsets: {}, cart: res.design.partIds }]);
    setCurrentId(id);
    setBusy(false);
  }, []);

  useEffect(() => {
    getCatalog().then(setCatalog);
    getRoom().then(setRoom);
    if (initialPrompt && !started.current) {
      started.current = true;
      run(initialPrompt, initialBudget);
    }
  }, [initialPrompt, initialBudget, run]);

  const onBudget = (v: number) => {
    setBudget(v);
    if (!current) return;
    clearTimeout(budgetTimer.current);
    const { id, design } = current;
    budgetTimer.current = setTimeout(async () => {
      const res = await rebudget(design, v);
      patch(id, (r) => ({ ...r, ...res, cart: res.design.partIds }));
    }, 150);
  };

  const removePart = (partId: string) => {
    if (!current) return;
    const ids = current.design.partIds.filter((i) => i !== partId);
    patch(current.id, (r) => ({ ...r, cart: r.cart.filter((i) => i !== partId), design: { ...r.design, partIds: ids }, derived: { ...r.derived, totalUsd: totalOf(ids) } }));
    setSelectedId(null);
    setUndo({ robotId: current.id, partId });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 10_000);
  };

  const restorePart = () => {
    if (!undo) return;
    patch(undo.robotId, (r) => {
      const ids = [...r.design.partIds, undo.partId];
      return { ...r, cart: [...r.cart, undo.partId], design: { ...r.design, partIds: ids }, derived: { ...r.derived, totalUsd: totalOf(ids) } };
    });
    setUndo(null);
  };

  // shortcut: swap cycles to the next catalog part in the same category; no re-run of checks until /api/rebudget is real.
  const swapPart = (part: Part) => {
    if (!current) return;
    const alt = catalog.find((c) => c.category === part.category && !current.design.partIds.includes(c.id));
    if (!alt) { setNote(`No other ${part.category} in the catalog.`); return; }
    const ids = current.design.partIds.map((i) => (i === part.id ? alt.id : i));
    patch(current.id, (r) => ({ ...r, cart: r.cart.map((i) => (i === part.id ? alt.id : i)), design: { ...r.design, partIds: ids, reasons: { ...r.design.reasons, [alt.id]: r.design.reasons[part.id] ?? "" } }, derived: { ...r.derived, totalUsd: totalOf(ids) } }));
    setSelectedId(alt.id);
  };

  const cartParts = current ? partsOf(current.cart) : [];
  const toggleCart = (id: string) => current && patch(current.id, (r) => ({ ...r, cart: r.cart.includes(id) ? r.cart.filter((i) => i !== id) : [...r.cart, id] }));
  const csv = () => current && exportCsv(cartParts.map((part) => ({ robot: current.name, part, reason: current.design.reasons[part.id] })));
  const kit = async () => {
    if (!current) return;
    setKitBusy(true);
    const ok = await downloadKit({ ...current.design, partIds: current.cart }, current.name);
    setKitBusy(false);
    setNote(ok ? "" : "Build kit isn’t available yet. Try again once the kit service is running.");
  };

  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const failed = current?.derived.checks.filter((c) => !c.ok).length ?? 0;
  const arm = parts.find((p) => p.category === "arm");

  return (
    <div className="app">
      <div className="pop-anchor">
        <TopBar
          tab={tab} onTab={setTab} checksOpen={checksOpen} onChecks={() => setChecksOpen(!checksOpen)} failed={failed}
          cartCount={cartParts.length} onCart={() => setCartOpen(true)}
          historyOpen={historyOpen} onHistory={() => setHistoryOpen(!historyOpen)}
        />
        {limitsOpen && (
          <div className="pop" role="dialog" aria-label="Limitations" style={{ top: 56 }}>
            <h3>What this can’t do yet</h3>
            <ul>
              <li>The build kit is untested on hardware.</li>
              <li>Prices come from vendor pages at scrape time and may have changed.</li>
              <li>Scanning your own room with a LiDAR iPhone is future work.</li>
            </ul>
          </div>
        )}
      </div>

      <div className="body">
        {historyOpen && (
          <HistorySidebar
            items={robots.map((r) => ({ id: r.id, name: r.name, totalUsd: r.derived.totalUsd, parts: r.design.partIds.length }))}
            currentId={currentId}
            onPick={(id) => { setCurrentId(id); setSelectedId(null); }}
            onNew={() => { setCurrentId(null); setPrompt(""); setChecksOpen(false); }}
            onRename={(id, name) => patch(id, (r) => ({ ...r, name }))}
          />
        )}
        <main className="stage">
          {busy && <LoadingView prompt={prompt} />}
          {!busy && !current && <EmptyView />}
          {!busy && current && tab === "robot" && (
            <>
              <div className="preview" style={{ right: checksOpen ? 396 : 0 }}>
                <RobotPreview
                  parts={parts} layers={layers} selectedId={selectedId} offsets={current.offsets}
                  onSelect={setSelectedId} onMove={(id, o) => patch(current.id, (r) => ({ ...r, offsets: { ...r.offsets, [id]: o } }))}
                />
              </div>
              <LayersPanel name={current.name} onName={(name) => patch(current.id, (r) => ({ ...r, name }))} layers={layers} onLayers={setLayers} />
              {arm?.caps.reachMm && <div className="reach"><div>Arm reach</div><div>{arm.caps.reachMm.max} mm</div></div>}
              {!layers.shell && <p className="hint">Click a part to select it. Drag to move it.</p>}
              {selected && (
                <div style={{ position: "absolute", right: checksOpen ? 380 : 28, top: 0 }}>
                  <PartCard
                    part={selected} reason={current.design.reasons[selected.id]}
                    inCart={current.cart.includes(selected.id)} onCart={() => toggleCart(selected.id)}
                    onSwap={() => swapPart(selected)}
                    onReset={() => patch(current.id, (r) => { const o = { ...r.offsets }; delete o[selected.id]; return { ...r, offsets: o }; })}
                    onDelete={() => removePart(selected.id)}
                  />
                </div>
              )}
            </>
          )}
          {!busy && current && tab === "sim" && <SimView room={room} sim={current.sim} />}
          {!busy && current && checksOpen && <ChecksPanel derived={current.derived} onLimits={() => setLimitsOpen(!limitsOpen)} />}
          {undo && (
            <div className="toast" role="status">Part removed <button onClick={restorePart}>Undo</button></div>
          )}
          <PromptBar prompt={prompt} onPrompt={setPrompt} budget={budget} onBudget={onBudget} busy={busy} onGenerate={() => run(prompt, budget)} />
        </main>
      </div>

      {cartOpen && <CartDrawer name={current?.name ?? ""} parts={cartParts} budgetUsd={current?.design.budgetUsd ?? budget} onClose={() => setCartOpen(false)} onKit={kit} onCsv={csv} busy={kitBusy} note={note} />}
    </div>
  );
}

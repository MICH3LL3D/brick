"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { Task, type Design, type Part } from "@/lib/contracts";
import { downloadKit, exportCsv, generate, getCatalog, getManuals, getRoom, rebudget, type ChatActionT } from "@/lib/api";
import { deriveAndCheck } from "@/lib/derive";
import { sumUsd } from "@/lib/money";
import { STUB_CATALOG, STUB_ROOM, type Result } from "@/lib/stub";
import { SUPPLIES } from "@/lib/supplies";
import { CartDrawer } from "./CartDrawer";
import { HistorySidebar } from "./HistorySidebar";
import { ALL_LAYERS, LayersPanel, type Layers } from "./LayersPanel";
import { EmptyView, ErrorView, LoadingView } from "./LoadingView";
import { PartCard } from "./PartCard";
import { PromptBar } from "./PromptBar";
import { Viewer } from "./robot3d/Viewer";
import { ChecksPanel } from "./ChecksPanel";
import { SimView } from "./SimView";
import { TopBar, type Tab } from "./TopBar";
import { BuildView } from "./BuildView";
import { OwlChat } from "./OwlChat";
import type { Mode } from "./ModeSwitch";
import type { ManualSetT } from "@/lib/manual-format";

type Robot = Result & { id: string; name: string; prompt: string; cart: string[]; task: z.infer<typeof Task> };
type Undo = { robotId: string; partId: string };

const baseId = (key: string) => key.replace(/#\d+$/, ""); // 3D keys duplicate parts as id#2

const titleOf = (prompt: string) => {
  const t = prompt.trim().split(/\s+/).slice(0, 3).join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function Playground({ initialPrompt, initialBudget }: { initialPrompt: string; initialBudget: number }) {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState(initialBudget);
  const [progress, setProgress] = useState<string[]>([]);
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
  const [genError, setGenError] = useState<{ message: string; prompt: string; budget: number } | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("design");
  const [manuals, setManuals] = useState<ManualSetT | null>(null);
  const [manualStatus, setManualStatus] = useState("");
  const [manualFailed, setManualFailed] = useState(false);
  const [manualTry, setManualTry] = useState(0); // bumped to rerun the manual effect on retry
  const manualsFor = useRef<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const budgetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(false);

  // Build shows the brick loading screen while the manuals are written for this robot; there are no placeholder pages.
  useEffect(() => {
    if (mode !== "build") return;
    const key = currentId ?? "none";
    if (manualsFor.current === key) return;
    manualsFor.current = key;
    const design = robots.find((r) => r.id === currentId)?.design ?? null;
    setManuals(null);
    setManualFailed(false);
    if (!design) return;
    setManualStatus("Writing your manuals…");
    getManuals(design, prompt, setManualStatus).then((m) => {
      if (manualsFor.current !== key) return;
      setManuals(m);
      setManualFailed(!m);
      setManualStatus("");
    });
  }, [mode, robots, currentId, prompt, manualTry]);

  const current = robots.find((r) => r.id === currentId) ?? null;
  const partsOf = useCallback((ids: string[]) => ids.map((i) => catalog.find((p) => p.id === i) ?? SUPPLIES.find((p) => p.id === i)).filter((p): p is Part => !!p), [catalog]);
  const parts = useMemo(() => (current ? partsOf(current.design.partIds) : []), [current, partsOf]);
  const totalOf = (ids: string[]) => sumUsd(partsOf(ids).map((p) => p.priceUsd));

  const patch = (id: string, f: (r: Robot) => Robot) => setRobots((rs) => rs.map((r) => (r.id === id ? f(r) : r)));

  const run = useCallback(async (text: string, b: number) => {
    setBusy(true);
    setSelectedId(null);
    setCurrentId(null);
    setGenError(null);
    setProgress([]);
    const out = await generate(text, b, (line) => setProgress((p) => [...p, line]));
    if (!out.ok) {
      setGenError({ message: out.error, prompt: text, budget: b });
      setBusy(false);
      return;
    }
    const res = out.result;
    const id = crypto.randomUUID();
    const t = Task.safeParse(res.task);
    const task = t.success ? t.data : { prompt: text, targetIds: [] };
    setRobots((rs) => [...rs, { ...res, task, id, name: titleOf(text), prompt: text, cart: [...res.design.partIds, ...SUPPLIES.map((x) => x.id)] }]);
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
      patch(id, (r) => ({ ...r, ...res, cart: [...res.design.partIds, ...SUPPLIES.map((x) => x.id)] }));
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

  // Re-run the checks in the browser (derive is pure) so owl edits update totals and checks; the sim stays as generated.
  const rederive = (r: Robot, design: Design): Robot => ({ ...r, design, derived: deriveAndCheck(design, r.task, room, catalog) });

  const applyChatAction = async (a: ChatActionT): Promise<string> => {
    if (!current) return "No robot to change yet.";
    if (a.type === "set_budget") {
      const v = Math.min(500, Math.max(50, Math.round(a.budgetUsd)));
      setBudget(v);
      const res = await rebudget(current.design, v);
      // shortcut: /api/rebudget is not built, so rebudget() returns stub parts; keep the real parts and only move the budget.
      const real = res.design.partIds.every((i) => catalog.some((p) => p.id === i));
      patch(current.id, (r) => (real ? { ...r, ...res, cart: [...res.design.partIds, ...SUPPLIES.map((x) => x.id)] } : rederive(r, { ...r.design, budgetUsd: v })));
      return `Budget set to $${v}`;
    }
    if (a.type === "swap_part") {
      const out = catalog.find((p) => p.id === a.removeId);
      const inn = catalog.find((p) => p.id === a.addId);
      if (!out || !current.design.partIds.includes(a.removeId)) return `Couldn't swap: ${out?.name ?? a.removeId} isn't in this design`;
      if (!inn) return `Couldn't swap: ${a.addId} isn't in the catalog`;
      if (inn.category !== out.category) return `Couldn't swap: ${inn.name} isn't a ${out.category}`;
      if (current.design.partIds.includes(inn.id)) return `Couldn't swap: ${inn.name} is already in the design`;
      patch(current.id, (r) => ({
        ...rederive(r, { ...r.design, partIds: r.design.partIds.map((i) => (i === out.id ? inn.id : i)), reasons: { ...r.design.reasons, [inn.id]: r.design.reasons[out.id] ?? "" } }),
        cart: r.cart.map((i) => (i === out.id ? inn.id : i)),
      }));
      if (selectedId && baseId(selectedId) === out.id) setSelectedId(inn.id);
      return `Swapped ${out.name} for ${inn.name}`;
    }
    void run(`${current.prompt}. ${a.instruction}`, budget);
    return `Redesigning: ${a.instruction}`;
  };

  const cartParts = current ? partsOf(current.cart) : [];
  const toggleCart = (id: string) => current && patch(current.id, (r) => ({ ...r, cart: r.cart.includes(id) ? r.cart.filter((i) => i !== id) : [...r.cart, id] }));
  const csv = () => current && exportCsv(cartParts.map((part) => ({ robot: current.name, part, reason: current.design.reasons[part.id] })));
  const kit = async () => {
    if (!current) return;
    setKitBusy(true);
    const ok = await downloadKit({ ...current.design, partIds: current.cart.filter((i) => !SUPPLIES.some((x) => x.id === i)) }, current.name);
    setKitBusy(false);
    setNote(ok ? "" : "Build kit isn’t available yet. Try again once the kit service is running.");
  };

  const selected = parts.find((p) => selectedId !== null && p.id === baseId(selectedId)) ?? null;
  const failed = current?.derived.checks.filter((c) => !c.ok).length ?? 0;
  const arm = parts.find((p) => p.category === "arm");

  if (mode === "build") {
    if (manuals) return <BuildView manuals={manuals} status={manualStatus} design={current?.design ?? null} prompt={prompt} onMode={setMode} />;
    if (!current) return <div className="app"><EmptyView message="Design a robot first, then its manuals appear here." /><button className="btn-gold" onClick={() => setMode("design")}>Back to design</button></div>;
    if (manualFailed) return <div className="app"><ErrorView message="The manuals didn’t come back." onRetry={() => { manualsFor.current = null; setManualTry((n) => n + 1); }} /></div>;
    return <div className="app"><LoadingView title="Writing your manuals" prompt={current.design.summary} progress={manualStatus ? [manualStatus] : []} /></div>;
  }

  return (
    <div className="app">
      <div className="pop-anchor">
        <TopBar
          tab={tab} onTab={setTab} checksOpen={checksOpen} onChecks={() => setChecksOpen(!checksOpen)} failed={failed}
          cartCount={cartParts.length} onCart={() => setCartOpen(!cartOpen)}
          historyOpen={historyOpen} onHistory={() => setHistoryOpen(!historyOpen)}
          mode={mode} onMode={setMode}
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
        <HistorySidebar
          open={historyOpen}
            items={robots.map((r) => ({ id: r.id, name: r.name, totalUsd: r.derived.totalUsd, parts: r.design.partIds.length }))}
            currentId={currentId}
            onPick={(id) => { setCurrentId(id); setSelectedId(null); }}
            onNew={() => { setCurrentId(null); setGenError(null); setPrompt(""); setChecksOpen(false); }}
            onRename={(id, name) => patch(id, (r) => ({ ...r, name }))}
          />
        <main className="stage">
          {busy && <LoadingView prompt={prompt} progress={progress} />}
          {!busy && !current && genError && <ErrorView message={genError.message} onRetry={() => run(genError.prompt, genError.budget)} />}
          {!busy && !current && !genError && <EmptyView />}
          {!busy && current && tab === "robot" && (
            <>
              <div className="preview" style={{ right: checksOpen ? 396 : 0 }}>
                <Viewer
                  parts={parts} layers={layers} selectedId={selectedId} onSelect={setSelectedId}
                />
              </div>
              <LayersPanel name={current.name} onName={(name) => patch(current.id, (r) => ({ ...r, name }))} layers={layers} onLayers={setLayers} />
              {arm?.caps.reachMm && <div className="reach"><div>Arm reach</div><div>{arm.caps.reachMm.max} mm</div></div>}
              {!layers.shell && <p className="hint">Click a part to select it.</p>}
              {selected && (
                <div style={{ position: "absolute", right: checksOpen ? 380 : 28, top: 0, width: 240 }}>
                  <PartCard
                    part={selected} reason={current.design.reasons[selected.id]}
                    inCart={current.cart.includes(selected.id)} onCart={() => toggleCart(selected.id)}
                    onSwap={() => swapPart(selected)}
                    onDelete={() => removePart(selected.id)}
                  />
                </div>
              )}
            </>
          )}
          {!busy && current && tab === "robot" && <OwlChat robotKey={current.id} design={current.design} task={current.task} onAction={applyChatAction} right={checksOpen ? 396 : 28} />}
          {!busy && current && tab === "sim" && <SimView room={room} sim={current.sim} />}
          {!busy && current && checksOpen && <ChecksPanel derived={current.derived} onLimits={() => setLimitsOpen(!limitsOpen)} />}
          {undo && (
            <div className="toast" role="status">Part removed <button onClick={restorePart}>Undo</button></div>
          )}
          <PromptBar prompt={prompt} onPrompt={setPrompt} budget={budget} onBudget={onBudget} busy={busy} hasRobot={!!current} onGenerate={() => run(prompt, budget)} />
        </main>
      </div>

      {cartOpen && <CartDrawer name={current?.name ?? ""} parts={cartParts} budgetUsd={current?.design.budgetUsd ?? budget} onClose={() => setCartOpen(false)} onKit={kit} onCsv={csv} busy={kitBusy} note={note} />}
    </div>
  );
}

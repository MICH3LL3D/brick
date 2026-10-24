"use client";
// Click to select, hover label, and drag on the deck plane for one part.
import { Html } from "@react-three/drei";
import { useThree, type RootState, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box3, Plane, Vector3, type Group } from "three";
import { C } from "../theme";

export type DeckBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

type Get = () => RootState;

// Scratch objects (three.js work is single-threaded).
const BOX = new Box3();
const V = new Vector3();
const DRAG_MIN_M = 0.001; // pointer travel on the plane before a press counts as a drag

// Imperative side effects on three.js/DOM objects, kept out of render so React's compiler is happy.
function setCursor(get: Get, cursor: string) {
  get().gl.domElement.style.cursor = cursor;
}
function setControls(get: Get, enabled: boolean) {
  const c = get().controls as unknown as { enabled: boolean } | null;
  if (c) c.enabled = enabled;
}
/** Puts the label at the top-centre of the part, in the Selectable group's local frame. */
function placeLabel(group: Group, label: Group) {
  group.updateWorldMatrix(true, true);
  BOX.setFromObject(group);
  if (BOX.isEmpty()) return;
  BOX.getCenter(V);
  V.y = BOX.max.y;
  label.position.copy(group.worldToLocal(V));
}
/**
 * A drag that ends over empty space is followed by a DOM click, which R3F would report as a
 * pointer-missed (deselect). Swallow that one click in the capture phase, before R3F sees it.
 */
function swallowNextClick() {
  const stop = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); done(); };
  const done = () => { window.removeEventListener("click", stop, true); clearTimeout(timer); };
  window.addEventListener("click", stop, true);
  const timer = setTimeout(done, 300); // no click came (e.g. released outside the window)
}

type Drag = {
  pointerId: number;
  target: { releasePointerCapture?: (id: number) => void; hasPointerCapture?: (id: number) => boolean };
  plane: Plane;
  hit: Vector3;        // where the pointer first hit the part (world)
  centre: Vector3;     // part's bounding-box centre at drag start (world)
  offset: { x: number; y: number };
  moved: boolean;
};

const LABEL_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap",
  padding: "3px 7px",
  borderRadius: 4,
  background: C.panel,
  color: C.ink,
  border: `1px solid ${C.gold}`,
  font: "11px/1.2 var(--mono, ui-monospace, monospace)",
  transform: "translateY(-100%)",
  marginTop: -6,
};

export function Selectable(p: {
  id: string;
  label: string;
  selected: boolean;
  draggable?: boolean;
  offsetMm?: { x: number; y: number };
  onSelect: (id: string) => void;
  onDrag?: (o: { x: number; y: number }) => void;
  /** World-space limits (metres) for the part's centre while dragging. */
  bounds?: DeckBounds;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const label = useRef<Group>(null);
  const drag = useRef<Drag | null>(null);
  const ownsCursor = useRef(false);
  const [hovered, setHovered] = useState(false);
  const get = useThree((s) => s.get);
  const showLabel = hovered || p.selected;
  const ox = p.offsetMm?.x ?? 0;
  const oy = p.offsetMm?.y ?? 0;

  // Label position is cached: recomputed when it appears, the offset moves the part, or the
  // children re-render (e.g. the arm extending). The label lives in this group's local frame,
  // so parents moving it (the arm carrying the tool) need no recompute.
  useLayoutEffect(() => {
    if (showLabel && group.current && label.current) placeLabel(group.current, label.current);
  }, [showLabel, ox, oy, p.children]);

  const cursor = (c: string) => { setCursor(get, c); ownsCursor.current = c !== ""; };

  const finishDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setControls(get, true);
    if (d.target.hasPointerCapture?.(d.pointerId)) d.target.releasePointerCapture?.(d.pointerId);
    return d;
  };

  // Unmounting mid-drag or mid-hover must not leave the camera locked or the cursor stuck.
  useEffect(() => () => {
    finishDrag();
    if (ownsCursor.current) setCursor(get, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    const d = finishDrag();
    if (d?.moved && e.nativeEvent.type === "pointerup") swallowNextClick();
    cursor(hovered ? "grab" : "");
  };

  return (
    <group
      ref={group}
      onClick={(e) => { e.stopPropagation(); p.onSelect(p.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); cursor(p.draggable ? "grab" : "pointer"); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); if (!drag.current) cursor(""); }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!p.draggable || !p.onDrag || e.button !== 0 || !group.current) return;
        p.onSelect(p.id);
        group.current.updateWorldMatrix(true, true);
        BOX.setFromObject(group.current);
        const target = e.target as unknown as Drag["target"] & { setPointerCapture: (id: number) => void };
        drag.current = {
          pointerId: e.pointerId,
          target,
          plane: new Plane(new Vector3(0, 1, 0), -e.point.y),
          hit: e.point.clone(),
          centre: BOX.getCenter(new Vector3()),
          offset: { x: ox, y: oy },
          moved: false,
        };
        target.setPointerCapture(e.pointerId);
        // R3F's listener is attached before OrbitControls', so this runs before the controls see
        // the press; their pointermove also bails while disabled, so the camera never rotates.
        setControls(get, false);
        cursor("grabbing");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        e.stopPropagation();
        const at = e.ray.intersectPlane(d.plane, V);
        if (!at) return;
        if (!d.moved && Math.hypot(at.x - d.hit.x, at.z - d.hit.z) < DRAG_MIN_M) return;
        d.moved = true;
        let cx = d.centre.x + at.x - d.hit.x;
        let cz = d.centre.z + at.z - d.hit.z;
        if (p.bounds) {
          cx = Math.min(p.bounds.maxX, Math.max(p.bounds.minX, cx));
          cz = Math.min(p.bounds.maxZ, Math.max(p.bounds.minZ, cz));
        }
        const next = {
          x: Math.round(d.offset.x + (cx - d.centre.x) * 1000),
          y: Math.round(d.offset.y + (cz - d.centre.z) * 1000),
        };
        if (next.x !== ox || next.y !== oy) p.onDrag?.(next);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {p.children}
      <group ref={label}>
        {showLabel && (
          <Html center zIndexRange={[20, 0]} pointerEvents="none" style={{ pointerEvents: "none" }}>
            <div style={{ ...LABEL_STYLE, borderColor: p.selected ? C.select : C.muted }}>{p.label}</div>
          </Html>
        )}
      </group>
    </group>
  );
}

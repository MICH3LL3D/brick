"use client";
// Click to select, hover label, and drag on the deck plane for one part.
import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box3, Plane, Vector3, type Group } from "three";
import type { RootState } from "@react-three/fiber";
import { C } from "../theme";

export type DeckBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

type Get = () => RootState;

// Scratch objects reused every frame (render is single-threaded).
const BOX = new Box3();
const V = new Vector3();

// Imperative side effects on three.js/DOM objects, kept out of render so React's compiler is happy.
function setCursor(get: Get, cursor: string) {
  get().gl.domElement.style.cursor = cursor;
}
function setControls(get: Get, enabled: boolean) {
  const c = get().controls as unknown as { enabled: boolean } | null;
  if (c) c.enabled = enabled;
}
function placeLabel(group: Group, label: Group) {
  BOX.setFromObject(group);
  if (BOX.isEmpty()) return;
  BOX.getCenter(V);
  V.y = BOX.max.y;
  label.position.copy(group.worldToLocal(V));
}

type Drag = {
  pointerId: number;
  plane: Plane;
  hit: Vector3;        // where the pointer first hit the part (world)
  centre: Vector3;     // part's bounding-box centre at drag start (world)
  offset: { x: number; y: number };
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
  const [hovered, setHovered] = useState(false);
  const get = useThree((s) => s.get);
  const showLabel = hovered || p.selected;

  // Keep the label just above the part's top, following drags and the arm moving the tool.
  useFrame(() => {
    if (showLabel && group.current && label.current) placeLabel(group.current, label.current);
  });

  // Never leave the cursor or the camera controls stuck if the part unmounts mid-hover/drag.
  useEffect(() => () => {
    setCursor(get, "");
    if (drag.current) setControls(get, true);
  }, [get]);

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setControls(get, true);
    const t = e.target as unknown as { hasPointerCapture?: (id: number) => boolean; releasePointerCapture?: (id: number) => void };
    if (t.hasPointerCapture?.(e.pointerId)) t.releasePointerCapture?.(e.pointerId);
    setCursor(get, hovered ? "grab" : "");
  };

  return (
    <group
      ref={group}
      onClick={(e) => { e.stopPropagation(); p.onSelect(p.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); setCursor(get, p.draggable ? "grab" : "pointer"); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); if (!drag.current) setCursor(get, ""); }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!p.draggable || !p.onDrag || e.button !== 0 || !group.current) return;
        p.onSelect(p.id);
        BOX.setFromObject(group.current);
        drag.current = {
          pointerId: e.pointerId,
          plane: new Plane(new Vector3(0, 1, 0), -e.point.y),
          hit: e.point.clone(),
          centre: BOX.getCenter(new Vector3()),
          offset: p.offsetMm ?? { x: 0, y: 0 },
        };
        (e.target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(e.pointerId);
        setControls(get, false);
        setCursor(get, "grabbing");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        e.stopPropagation();
        const at = e.ray.intersectPlane(d.plane, V);
        if (!at) return;
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
        const cur = p.offsetMm ?? { x: 0, y: 0 };
        if (next.x !== cur.x || next.y !== cur.y) p.onDrag?.(next);
      }}
      onPointerUp={endDrag}
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

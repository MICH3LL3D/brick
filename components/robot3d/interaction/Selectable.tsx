"use client";
// Click to select and hover label for one part.
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box3, Vector3, type Group } from "three";
import { C } from "../theme";

// Scratch objects (three.js work is single-threaded).
const BOX = new Box3();
const V = new Vector3();

/** Puts the label at the top-centre of the part, in the Selectable group's local frame. */
function placeLabel(group: Group, label: Group) {
  group.updateWorldMatrix(true, true);
  BOX.setFromObject(group);
  if (BOX.isEmpty()) return;
  BOX.getCenter(V);
  V.y = BOX.max.y;
  label.position.copy(group.worldToLocal(V));
}

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
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const label = useRef<Group>(null);
  const ownsCursor = useRef(false);
  const [hovered, setHovered] = useState(false);
  const get = useThree((s) => s.get);
  const showLabel = hovered || p.selected;

  // Label position is cached: recomputed when it appears or the children re-render (e.g. the arm
  // extending). The label lives in this group's local frame, so parents moving it (the arm
  // carrying the tool) need no recompute.
  useLayoutEffect(() => {
    if (showLabel && group.current && label.current) placeLabel(group.current, label.current);
  }, [showLabel, p.children]);

  const cursor = (c: string) => { get().gl.domElement.style.cursor = c; ownsCursor.current = c !== ""; };

  // Unmounting mid-hover must not leave the cursor stuck.
  useEffect(() => () => {
    if (ownsCursor.current) get().gl.domElement.style.cursor = "";
  }, [get]);

  return (
    <group
      ref={group}
      onClick={(e) => { e.stopPropagation(); p.onSelect(p.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); cursor("pointer"); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); cursor(""); }}
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

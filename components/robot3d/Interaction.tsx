"use client";
// TASK C owns this file: selection, hover labels, drag on the deck, wiring lines.
// Placeholder: click to select only.
import type { ReactNode } from "react";
import type { RobotLayout } from "@/lib/robot3d/layout";

/**
 * Wraps a part so it can be clicked (select) and, when `draggable`, dragged on the deck plane.
 * `onDrag` receives the new offset in mm (x forward, y left) relative to the part's layout spot.
 */
export function Selectable(p: {
  id: string;
  label: string;
  selected: boolean;
  draggable?: boolean;
  offsetMm?: { x: number; y: number };
  onSelect: (id: string) => void;
  onDrag?: (o: { x: number; y: number }) => void;
  children: ReactNode;
}) {
  return (
    <group onPointerDown={(e) => { e.stopPropagation(); p.onSelect(p.id); }}>
      {p.children}
    </group>
  );
}

/** Wiring lines between the Pi, drivers, battery and powered parts. */
export function Wiring({ layout, visible }: { layout: RobotLayout; visible: boolean }) {
  void layout;
  if (!visible) return null;
  return null;
}

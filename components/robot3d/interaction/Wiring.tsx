"use client";
// Cable lines between the Pi, motor drivers, battery, regulator and powered parts.
import { QuadraticBezierLine } from "@react-three/drei";
import { useMemo } from "react";
import type { RobotLayout } from "@/lib/robot3d/layout";
import { C } from "../theme";
import { cablesFor, type OffsetsMm } from "./cables";

// Cables are decoration: keep them out of raycasts so they never block clicks or count as hits.
const noRaycast = (l: { raycast: unknown } | null) => { if (l) l.raycast = () => null; };

export function Wiring({ layout, visible, offsets }: { layout: RobotLayout; visible: boolean; offsets?: OffsetsMm }) {
  const cables = useMemo(() => cablesFor(layout, offsets), [layout, offsets]);
  if (!visible) return null;
  return (
    <group>
      {cables.map((c) => (
        <QuadraticBezierLine
          key={c.key} start={c.start} end={c.end} mid={c.mid}
          // Camera ribbons: wide, flat-looking and light grey so they read apart from round wires.
          color={c.kind === "ribbon" ? C.muted : C.blue} lineWidth={c.kind === "ribbon" ? 5 : 2}
          toneMapped={false} ref={noRaycast}
        />
      ))}
    </group>
  );
}

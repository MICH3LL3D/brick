"use client";
// TASK B owns this file: arm geometry and extend/retract animation.
// Placeholder: a static column with the tool on top.
import type { ReactNode } from "react";
import type { ArmRig as Rig } from "@/lib/robot3d/layout";
import { CATEGORY_COLOR } from "./theme";

/**
 * Draws the arm at rig.mount. `extend` is 0 (retracted) to 1 (fully extended).
 * `tool` is rendered at the arm tip (the caller passes the tool mesh, already selectable).
 */
export function ArmRig({ rig, extend, tool }: { rig: Rig; extend: number; tool?: ReactNode }) {
  const h = rig.baseSize[1] + (rig.extendable ? extend * Math.max(0, rig.liftMaxM - rig.baseSize[1]) : 0);
  return (
    <group position={rig.mount}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[rig.baseSize[0], h, rig.baseSize[2]]} />
        <meshStandardMaterial color={CATEGORY_COLOR.arm} />
      </mesh>
      <group position={[0, h, 0]}>{tool}</group>
    </group>
  );
}

/** HTML overlay control for extend/retract. Rendered outside the Canvas by RobotScene. */
export function ArmControls({ extend, onExtend }: { extend: number; onExtend: (v: number) => void }) {
  return (
    <label className="arm-controls">
      Arm
      <input type="range" min={0} max={1} step={0.01} value={extend} onChange={(e) => onExtend(Number(e.target.value))} />
    </label>
  );
}

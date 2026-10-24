"use client";
// TASK A owns this file: detailed procedural meshes per part category.
// Placeholder: plain boxes and cylinders sized from catalog dims.
import type { Placed, Wheel } from "@/lib/robot3d/layout";
import { C, CATEGORY_COLOR } from "./theme";

export function ChassisMesh({ placed, shell, frame }: { placed: Placed; shell: boolean; frame: boolean }) {
  return (
    <mesh position={placed.pos}>
      <boxGeometry args={placed.size} />
      <meshStandardMaterial color={CATEGORY_COLOR.chassis} wireframe={!shell && frame} transparent opacity={shell ? 1 : 0.25} />
    </mesh>
  );
}

export function WheelMesh({ wheel }: { wheel: Wheel }) {
  return (
    <mesh position={wheel.pos} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[wheel.radius, wheel.radius, wheel.width, 24]} />
      <meshStandardMaterial color="#1A1816" />
    </mesh>
  );
}

/** One deck, front or tool part. `selected` highlights it. Position is applied by the caller. */
export function PartMesh({ placed, selected }: { placed: Placed; selected: boolean }) {
  return (
    <mesh>
      <boxGeometry args={placed.size} />
      <meshStandardMaterial color={CATEGORY_COLOR[placed.part.category] ?? C.muted} emissive={selected ? C.select : "#000"} emissiveIntensity={selected ? 0.4 : 0} />
    </mesh>
  );
}

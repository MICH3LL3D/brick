"use client";
// 3D robot viewer: react-three-fiber scene built from the design's catalog parts.
// Layout math lives in src/lib/robot3d/layout.ts; meshes, arm and interaction are separate files.
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { layoutRobot, type Vec3 } from "@/lib/robot3d/layout";
import { ArmControls, ArmRig } from "./ArmRig";
import { Selectable, Wiring } from "./Interaction";
import { ChassisMesh, PartMesh, WheelMesh } from "./PartMesh";
import { C } from "./theme";
import type { SceneProps } from "./types";

/** Re-frames the camera whenever the robot changes size (the Canvas camera prop is only read once). */
function CameraFit({ bounds }: { bounds: Vec3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  const [bx, by, bz] = bounds;
  useEffect(() => {
    const span = Math.max(bx, by, bz, 0.2);
    camera.position.set(span * 1.5, span * 1.1, span * 1.5);
    controls?.target.set(0, by / 2, 0);
    controls?.update();
  }, [camera, controls, bx, by, bz]);
  return null;
}

export function RobotScene(p: SceneProps) {
  const layout = useMemo(() => layoutRobot(p.parts), [p.parts]);
  const [extend, setExtend] = useState(0);
  const span = Math.max(...layout.bounds, 0.2);
  const MM = 0.001;

  const toolNode = layout.tool && (
    <Selectable id={layout.tool.part.id} label={layout.tool.part.name} selected={p.selectedId === layout.tool.part.id} onSelect={p.onSelect}>
      <group position={[0, layout.tool.size[1] / 2, 0]}>
        <PartMesh placed={layout.tool} selected={p.selectedId === layout.tool.part.id} />
      </group>
    </Selectable>
  );

  return (
    <div className="robot-scene" style={{ position: "relative", width: "100%", height: "100%", minHeight: 280 }}>
      <Canvas
        shadows
        camera={{ position: [span * 1.6, span * 1.2, span * 1.6], fov: 40, near: 0.01, far: 50 }}
        onPointerMissed={() => p.onSelect(null)}
        style={{ background: C.bg }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 4, 2]} intensity={1.2} castShadow />
        <Grid args={[4, 4]} cellSize={0.05} sectionSize={0.25} cellColor="#2A2724" sectionColor="#3A3632" fadeDistance={3} infiniteGrid />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.5} scale={span * 4} blur={2} far={1} />

        {layout.chassis && (
          <Selectable id={layout.chassis.part.id} label={layout.chassis.part.name} selected={p.selectedId === layout.chassis.part.id} onSelect={p.onSelect}>
            <ChassisMesh placed={layout.chassis} shell={p.layers.shell} frame={p.layers.frame} />
          </Selectable>
        )}
        {layout.wheels.map((w) => <WheelMesh key={w.key} wheel={w} />)}

        {p.layers.parts && layout.items.map((it) => {
          const o = p.offsets[it.key] ?? { x: 0, y: 0 };
          return (
            <Selectable
              key={it.key} id={it.key} label={it.part.name} selected={p.selectedId === it.key}
              draggable={it.role === "deck"} offsetMm={o}
              onSelect={p.onSelect} onDrag={(next) => p.onMove(it.key, next)}
            >
              <group position={[it.pos[0] + o.x * MM, it.pos[1], it.pos[2] + o.y * MM]}>
                <PartMesh placed={it} selected={p.selectedId === it.key} />
              </group>
            </Selectable>
          );
        })}

        {layout.arm && (
          <Selectable id={layout.arm.key} label={layout.arm.part.name} selected={p.selectedId === layout.arm.key} onSelect={p.onSelect}>
            <ArmRig rig={layout.arm} extend={extend} tool={toolNode} />
          </Selectable>
        )}
        {!layout.arm && toolNode}

        <Wiring layout={layout} visible={p.layers.wiring} />
        <OrbitControls makeDefault target={[0, layout.bounds[1] / 2, 0]} minDistance={0.15} maxDistance={4} />
        <CameraFit bounds={layout.bounds} />
      </Canvas>
      {layout.arm && <ArmControls extend={extend} onExtend={setExtend} />}
    </div>
  );
}

"use client";
// Procedural low-poly meshes per part, each sized exactly to the catalog bounding box so scale
// stays true. Building blocks and per-part shapes live in ./parts.
import { Edges } from "@react-three/drei";
import type { Part } from "@/lib/contracts";
import type { Placed, Wheel } from "@/lib/robot3d/layout";
import { AaHolder, Gripper, NimhPack, PanTilt, PeristalticPump, Rounded, SubmersiblePump, Tank, UsbPack } from "./parts/mechanical";
import { Breakout, Camera, DistanceIR, RaspberryPi, Regulator, Ultrasonic } from "./parts/electronics";
import { BOX, Box, Cyl, K, mat, noRaycast, Selected, SelectBox, SILVER, type V3 } from "./parts/kit";
import { C, CATEGORY_COLOR } from "./theme";

/**
 * Chassis: deck plate on top, body below, gearmotors inside.
 * Mirrors the 2D layers: `shell` draws a solid body; without it the body is a faint ghost so the
 * motors show (and clicks pass through it). `frame` adds side rails, corner posts and outline edges (dashed when open).
 */
export function ChassisMesh({ placed, shell, frame, selected = false }: { placed: Placed; shell: boolean; frame: boolean; selected?: boolean }) {
  const [l, h, w] = placed.size;
  const t = Math.min(0.005, Math.max(0.002, h * 0.06));
  const bodyH = h - t;
  const bodyY = -t / 2;
  const rail = Math.min(h, w) * 0.06;
  const four = (placed.part.caps.wheels ?? 2) >= 4;
  const motorXs = four ? [l * 0.32, -l * 0.32] : [0];
  const bodyMat = shell ? mat(CATEGORY_COLOR.chassis, { rough: 0.6 }, selected) : mat(C.muted, { opacity: 0.1, rough: 0.4 }, selected);
  return (
    <Selected.Provider value={selected}>
      <group position={placed.pos}>
        <Box s={[l, t, w]} p={[0, h / 2 - t / 2, 0]} c="#3A3632" look={{ metal: 0.6, rough: 0.45 }} />
        <mesh geometry={BOX} material={bodyMat} scale={[l * 0.94, bodyH, w * 0.86]} position={[0, bodyY, 0]} castShadow={shell} receiveShadow dispose={null} raycast={shell ? undefined : noRaycast} />
        {frame && (
          <Edges geometry={BOX} scale={[l * 0.94, bodyH, w * 0.86]} position={[0, bodyY, 0]} color={shell ? C.ink : C.muted} lineWidth={1.25} dashed={!shell} dashSize={0.006} gapSize={0.006} transparent opacity={shell ? 0.5 : 0.7} />
        )}
        {!shell && motorXs.map((x) => [-1, 1].map((k) => (
          <group key={`${x}${k}`}>
            <Box s={[Math.min(l * 0.25, 0.07), bodyH * 0.4, w * 0.2]} p={[x, bodyY - bodyH * 0.25, k * w * 0.3]} c={CATEGORY_COLOR.power} />
            <Cyl d={bodyH * 0.12} len={w * 0.08} p={[x, bodyY - bodyH * 0.25, k * w * 0.43]} axis="z" c={K.silver} look={SILVER} detail="lo" />
          </group>
        )))}
        {frame && !shell && (
          <>
            {[-1, 1].map((k) => [1, -1].map((v) => (
              <Box key={`r${k}${v}`} s={[l * 0.96, rail, rail]} p={[0, bodyY + v * (bodyH / 2 - rail / 2), k * (w * 0.43 - rail / 2)]} c={C.muted} look={SILVER} />
            )))}
            {[-1, 1].map((k) => [-1, 1].map((x) => (
              <Box key={`p${k}${x}`} s={[rail, bodyH, rail]} p={[x * (l * 0.47 - rail / 2), bodyY, k * (w * 0.43 - rail / 2)]} c={C.muted} look={SILVER} />
            )))}
          </>
        )}
        {selected && <SelectBox size={placed.size} />}
      </group>
    </Selected.Provider>
  );
}

/** Wheel: rubber tyre, metal rim on the outer face, hub and three spokes. Axle along z. */
export function WheelMesh({ wheel }: { wheel: Wheel }) {
  const { radius: r, width: wd } = wheel;
  const out = Math.sign(wheel.pos[2]) || 1;
  const face = out * wd * 0.47;
  return (
    <group position={wheel.pos}>
      <Cyl d={r * 2} len={wd * 0.9} axis="z" c={K.rubber} look={{ rough: 0.95 }} detail="hi" />
      <Cyl d={r * 2 * 0.86} len={wd * 0.92} axis="z" c={K.black} look={{ rough: 0.9 }} detail="hi" />
      <Cyl d={r * 1.3} len={wd * 0.06} p={[0, 0, face]} axis="z" c={K.metal} look={SILVER} />
      {[0, 1, 2].map((i) => (
        <Box key={i} s={[r * 1.25, r * 0.12, wd * 0.03]} p={[0, 0, face + out * wd * 0.03]} r={[0, 0, (i * Math.PI) / 3]} c={C.gold} look={SILVER} />
      ))}
      <Cyl d={r * 0.35} len={wd * 0.06} p={[0, 0, face + out * wd * 0.02]} axis="z" c={C.gold} look={SILVER} detail="lo" />
    </group>
  );
}

/** Picks the shape for a part from its id, then its category. */
function PartBody({ part, s }: { part: Part; s: V3 }) {
  const id = part.id;
  const tint = CATEGORY_COLOR[part.category] ?? C.muted;
  if (part.category === "controller") return <RaspberryPi s={s} />;
  if (id === "md-motor-hat" || id === "md-g2-24v14") return <Breakout s={s} c={tint} chip={0.22} />;
  if (part.category === "motor_driver") return <Breakout s={s} c={tint} headers="both" />;
  if (id === "servo-pca9685") return <Breakout s={s} c={tint} headers="long" chip={0.2} />;
  if (id === "adc-ads1115" || id.startsWith("imu-")) return <Breakout s={s} c={id.startsWith("imu-") ? CATEGORY_COLOR.sensor : tint} chip={0.3} />;
  if (id.startsWith("reg-")) return <Regulator s={s} />;
  if (id === "bat-usb-10000") return <UsbPack s={s} />;
  if (id === "bat-aa4") return <AaHolder s={s} />;
  if (id.startsWith("bat-nimh")) return <NimhPack s={s} aaa={/AAA/.test(part.name)} />;
  if (id.startsWith("tank-")) return <Tank s={s} />;
  if (id === "tool-pump-submersible") return <SubmersiblePump s={s} />;
  if (id.startsWith("tool-pump")) return <PeristalticPump s={s} board={id === "tool-pump-gravity"} />;
  if (id === "tool-gripper") return <Gripper s={s} />;
  if (id === "tool-cam-pantilt") return <PanTilt s={s} />;
  if (id.startsWith("cam-")) return <Camera s={s} wide={id.endsWith("wide")} />;
  if (id.startsWith("us-")) return <Ultrasonic s={s} />;
  if (id.startsWith("dist-")) return <DistanceIR s={s} />;
  return <Rounded s={s} c={tint} />;
}

/** One deck, front or tool part. `selected` highlights it. Position is applied by the caller. */
export function PartMesh({ placed, selected }: { placed: Placed; selected: boolean }) {
  return (
    <Selected.Provider value={selected}>
      <group>
        <PartBody part={placed.part} s={placed.size} />
        {selected && <SelectBox size={placed.size} />}
      </group>
    </Selected.Provider>
  );
}

"use client";
// Batteries, water tank, pumps, gripper and pan-tilt mount.
// Each mesh fills its catalog bounding box s = [l (x), h (y), w (z)] centred at the origin.
import { RoundedBox } from "@react-three/drei";
import { useContext } from "react";
import { CATEGORY_COLOR } from "../theme";
import { Box, Cyl, K, mat, Selected, SILVER, type V3 } from "./kit";

/** Rounded box in one colour (USB power bank, and the generic fallback). */
export function Rounded({ s, c }: { s: V3; c: string }) {
  const sel = useContext(Selected);
  const r = Math.min(...s) * 0.25;
  return <RoundedBox args={s} radius={r} smoothness={2} material={mat(c, { rough: 0.55 }, sel)} castShadow receiveShadow />;
}

export function UsbPack({ s }: { s: V3 }) {
  const [l, h, w] = s;
  return (
    <group>
      <Rounded s={s} c={K.dark} />
      <Box s={[l * 0.5, h * 0.06, w * 0.08]} p={[-l * 0.1, h / 2 - h * 0.02, 0]} c={CATEGORY_COLOR.power} />
      {[-1, 1].map((k) => (
        <Box key={k} s={[l * 0.04, h * 0.3, w * 0.22]} p={[l / 2 - l * 0.015, 0, k * w * 0.2]} c={K.silver} look={SILVER} />
      ))}
    </group>
  );
}

/** Cells lying along x in a cols (z) by rows (y) grid, positive caps included, spanning exactly l. */
function Cells({ l, d, cols, rows, y0 }: { l: number; d: number; cols: number; rows: number; y0: number }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const z = (c - (cols - 1) / 2) * d;
    const y = y0 + d / 2 + r * d;
    out.push(
      <group key={`${r}-${c}`}>
        <Cyl d={d * 0.96} len={l * 0.92} p={[-l * 0.04, y, z]} axis="x" c={CATEGORY_COLOR.power} look={{ metal: 0.3, rough: 0.45 }} />
        <Cyl d={d * 0.35} len={l * 0.08} p={[l * 0.46, y, z]} axis="x" c={K.silver} look={SILVER} detail="lo" />
      </group>,
    );
  }
  return <>{out}</>;
}

/** AA holder: black tray with four cells side by side. */
export function AaHolder({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const d = Math.min((w * 0.92) / 4, h * 0.85);
  return (
    <group>
      <Box s={[l, h * 0.45, w]} p={[0, -h / 2 + h * 0.225, 0]} c={K.black} />
      <group position={[-l * 0.05, 0, 0]}>
        <Cells l={l * 0.8} d={d} cols={4} rows={1} y0={-h / 2 + h * 0.08} />
      </group>
      <Box s={[l * 0.08, h * 0.3, w * 0.15]} p={[-l / 2 + l * 0.06, h * 0.05, 0]} c={K.dark} />
    </group>
  );
}

const MAX_CELLS = 24;

/** Shrink-wrapped NiMH stick pack: a grid of cells inside a tinted wrap. */
export function NimhPack({ s, aaa }: { s: V3; aaa: boolean }) {
  const [l, h, w] = s;
  const d0 = aaa ? 0.0105 : 0.0145;
  let cols = Math.max(1, Math.round(w / d0));
  let rows = Math.max(1, Math.round(h / d0));
  // Cap the cell count so an oversized custom pack cannot explode draw calls.
  while (cols * rows > MAX_CELLS) { if (cols >= rows) cols--; else rows--; }
  const d = Math.min(w / cols, h / rows);
  return (
    <group>
      <Cells l={l} d={d} cols={cols} rows={rows} y0={-h / 2 + (h - rows * d) / 2} />
      <Box s={[l, h, w]} c={CATEGORY_COLOR.power} look={{ opacity: 0.22, rough: 0.3 }} />
      <Box s={[l * 0.06, h * 0.3, w * 0.4]} p={[-l / 2 + l * 0.03, h * 0.2, 0]} c={K.tube} />
    </group>
  );
}

/** Translucent bottle with a water column and a wide-mouth cap. */
export function Tank({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const d = Math.min(l, w);
  const body = h * 0.88;
  const capH = h - body;
  const y0 = -h / 2;
  return (
    <group>
      <Cyl d={d * 0.92} len={body * 0.6} p={[0, y0 + body * 0.3 + 0.001, 0]} c={K.water} look={{ opacity: 0.75, rough: 0.2 }} detail="hi" order={1} />
      <Cyl d={d} len={body} p={[0, y0 + body / 2, 0]} c={K.bottle} look={{ opacity: 0.22, rough: 0.1 }} detail="hi" order={2} />
      <Cyl d={d * 0.82} len={capH} p={[0, y0 + body + capH / 2, 0]} c={CATEGORY_COLOR.tool} detail="hi" />
    </group>
  );
}

/** Peristaltic pump: motor can behind a round pump head with two tube stubs on top. */
export function PeristalticPump({ s, board }: { s: V3; board: boolean }) {
  const [l, h, w] = s;
  const m = Math.min(h, w);
  const headD = m * 0.95;
  const headX = l / 2 - l * 0.19;
  const nozLen = h / 2 - headD * 0.3;
  return (
    <group>
      <Cyl d={m * 0.62} len={l * 0.6} p={[-l / 2 + l * 0.3, 0, 0]} axis="x" c={K.metal} look={SILVER} />
      <Cyl d={headD} len={l * 0.38} p={[headX, 0, 0]} axis="x" c={CATEGORY_COLOR.tool} />
      <Cyl d={headD * 0.55} len={l * 0.02} p={[l / 2 - l * 0.01, 0, 0]} axis="x" c={K.tube} look={{ opacity: 0.8 }} />
      {[-1, 1].map((k) => (
        <Cyl key={k} d={m * 0.12} len={nozLen} p={[headX, headD * 0.3 + nozLen / 2, k * headD * 0.25]} c={K.tube} detail="lo" />
      ))}
      {board && <Box s={[l * 0.55, h * 0.05, w]} p={[-l * 0.2, -h / 2 + h * 0.025, 0]} c={CATEGORY_COLOR.sensor} />}
    </group>
  );
}

/** Submersible pump: dark motor body, intake band and an outlet nozzle at the front. */
export function SubmersiblePump({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const m = Math.min(h, w);
  return (
    <group>
      <Cyl d={m * 0.92} len={l * 0.72} p={[-l / 2 + l * 0.36, 0, 0]} axis="x" c={K.rubber} />
      <Cyl d={m * 0.96} len={l * 0.12} p={[-l / 2 + l * 0.66, 0, 0]} axis="x" c={CATEGORY_COLOR.tool} />
      <Cyl d={m * 0.28} len={l * 0.28} p={[l / 2 - l * 0.14, 0, 0]} axis="x" c={CATEGORY_COLOR.tool} detail="lo" />
    </group>
  );
}

/** Servo gripper: servo block at the back, a palm bar and two jaws pointing forward (+x). */
export function Gripper({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const jawL = l * 0.57;
  const jawW = w * 0.12;
  const jawX = l / 2 - jawL / 2;
  return (
    <group>
      <Box s={[l * 0.35, h, w * 0.5]} p={[-l / 2 + l * 0.175, 0, 0]} c={K.rubber} />
      <Box s={[l * 0.08, h * 0.6, w]} p={[-l / 2 + l * 0.39, 0, 0]} c={K.metal} look={SILVER} />
      {[-1, 1].map((k) => (
        <group key={k}>
          <Box s={[jawL, h * 0.5, jawW]} p={[jawX, 0, k * (w / 2 - jawW / 2)]} c={CATEGORY_COLOR.tool} />
          <Box s={[l * 0.08, h * 0.5, w * 0.12]} p={[l / 2 - l * 0.04, 0, k * (w / 2 - jawW - w * 0.06)]} c={CATEGORY_COLOR.tool} />
        </group>
      ))}
    </group>
  );
}

/** Pan-tilt kit: base plate, pan servo, U bracket, tilt servo and a small camera platform. */
export function PanTilt({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const y0 = -h / 2;
  const plate = h * 0.06;
  const servoH = h * 0.35;
  const brH = h * 0.4;
  const bracketY = y0 + plate + servoH;
  const lensD = Math.min(l, w, h * 0.15) * 0.8;
  return (
    <group>
      <Box s={[l, plate, w]} p={[0, y0 + plate / 2, 0]} c={K.dark} />
      <Box s={[l * 0.6, servoH, w * 0.5]} p={[0, y0 + plate + servoH / 2, 0]} c={CATEGORY_COLOR.tool} />
      <Box s={[l * 0.7, h * 0.04, w * 0.9]} p={[0, bracketY + h * 0.02, 0]} c={K.metal} look={SILVER} />
      {[-1, 1].map((k) => (
        <Box key={k} s={[l * 0.4, brH, w * 0.05]} p={[0, bracketY + brH / 2, k * w * 0.42]} c={K.metal} look={SILVER} />
      ))}
      <Box s={[l * 0.45, brH * 0.6, w * 0.5]} p={[0, bracketY + brH * 0.5, 0]} c={CATEGORY_COLOR.tool} />
      <Box s={[l * 0.7, h * 0.05, w * 0.7]} p={[0, h / 2 - lensD - h * 0.025, 0]} c={K.dark} />
      <Cyl d={lensD} len={l * 0.3} p={[l * 0.25, h / 2 - lensD / 2, 0]} axis="x" c={K.black} detail="lo" />
    </group>
  );
}

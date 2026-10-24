"use client";
// Boards: Raspberry Pi, drivers/HATs/breakouts, regulators and small sensors.
// Each mesh fills its catalog bounding box s = [l (x), h (y), w (z)] centred at the origin.
import { CATEGORY_COLOR } from "../theme";
import { Box, Cyl, GLOSS, K, SILVER, type V3 } from "./kit";

const pcbT = (h: number) => Math.min(0.0016, h * 0.4);

/** PCB slab on the bottom of the box; returns the y of its top face. */
function Pcb({ s, c }: { s: V3; c: string }) {
  const t = pcbT(s[1]);
  return <Box s={[s[0], t, s[2]]} p={[0, -s[1] / 2 + t / 2, 0]} c={c} look={{ rough: 0.6 }} />;
}

/** Row of header pins along x: black base with a gold pin strip on top. */
function Header({ len, h, w, p }: { len: number; h: number; w: number; p: V3 }) {
  return (
    <group position={p}>
      <Box s={[len, h * 0.4, w]} p={[0, -h * 0.3, 0]} c={K.black} />
      <Box s={[len * 0.96, h * 0.6, w * 0.45]} p={[0, h * 0.2, 0]} c={K.gold} look={SILVER} />
    </group>
  );
}

export function RaspberryPi({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const t = pcbT(h);
  const top = -h / 2 + t;
  const up = h - t;
  const hdrH = Math.min(up * 0.5, 0.0085);
  const port = (z: number, wz: number, hy: number, c: string) => (
    <Box s={[l * 0.25, hy, wz]} p={[l / 2 - l * 0.125, top + hy / 2, z]} c={c} look={SILVER} />
  );
  return (
    <group>
      <Pcb s={s} c={CATEGORY_COLOR.controller} />
      <Header len={l * 0.6} h={hdrH} w={w * 0.09} p={[-l * 0.08, top + hdrH / 2, -w / 2 + w * 0.07]} />
      {port(w * 0.32, w * 0.3, up * 0.8, K.metal)}
      {port(0, w * 0.26, up, K.silver)}
      {port(-w * 0.3, w * 0.26, up, K.silver)}
      <Box s={[l * 0.17, up * 0.1, w * 0.25]} p={[-l * 0.05, top + up * 0.05, w * 0.08]} c={K.silver} look={SILVER} />
      <Box s={[l * 0.12, up * 0.08, w * 0.16]} p={[-l * 0.27, top + up * 0.04, w * 0.1]} c={K.black} />
    </group>
  );
}

/**
 * Generic breakout or HAT: PCB, a main chip, header rows, and (for tall boards) screw terminals
 * and a capacitor.
 */
export function Breakout({ s, c, headers = "one", chip = 0.32 }: { s: V3; c: string; headers?: "one" | "both" | "long"; chip?: number }) {
  const [l, h, w] = s;
  const t = pcbT(h);
  const top = -h / 2 + t;
  const up = h - t;
  const tall = up > 0.005;
  const chipH = Math.min(up * 0.5, 0.0015);
  const hdrH = tall ? Math.min(up * 0.6, 0.006) : up;
  const rows = headers === "both" ? [-1, 1] : [-1];
  return (
    <group>
      <Pcb s={s} c={c} />
      <Box s={[l * chip, chipH, w * chip]} p={[tall ? -l * 0.1 : 0, top + chipH / 2, 0]} c={K.black} look={{ rough: 0.4 }} />
      {headers === "long" ? (
        <Header len={l * 0.7} h={hdrH} w={w * 0.3} p={[0, top + hdrH / 2, w * 0.3]} />
      ) : (
        rows.map((side) => <Header key={side} len={l * 0.8} h={hdrH} w={w * 0.1} p={[0, top + hdrH / 2, side * (w / 2 - w * 0.08)]} />)
      )}
      {tall && (
        <>
          {[-1, 1].map((k) => (
            <Box key={k} s={[l * 0.12, up * 0.7, w * 0.28]} p={[l / 2 - l * 0.08, top + up * 0.35, k * w * 0.18]} c={CATEGORY_COLOR.tool} />
          ))}
          <Cyl d={Math.min(w * 0.2, up)} len={up * 0.9} p={[l * 0.12, top + up * 0.45, w * 0.18]} c={K.silver} look={SILVER} detail="lo" />
        </>
      )}
    </group>
  );
}

/** Step-down regulator: tiny PCB with an inductor, capacitor and chip. */
export function Regulator({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const t = pcbT(h);
  const top = -h / 2 + t;
  const up = h - t;
  return (
    <group>
      <Pcb s={s} c={CATEGORY_COLOR.power} />
      <Box s={[l * 0.4, up, w * 0.5]} p={[-l * 0.18, top + up / 2, 0]} c={K.dark} />
      <Cyl d={Math.min(w * 0.3, l * 0.25)} len={up * 0.8} p={[l * 0.25, top + up * 0.4, w * 0.2]} c={K.silver} look={SILVER} detail="lo" />
      <Box s={[l * 0.2, up * 0.3, w * 0.2]} p={[l * 0.22, top + up * 0.15, -w * 0.22]} c={K.black} />
    </group>
  );
}

/** Camera module: board at the back, lens housing and lens pointing forward (+x). */
export function Camera({ s, wide }: { s: V3; wide: boolean }) {
  const [l, h, w] = s;
  const m = Math.min(h, w);
  const lensD = m * 0.55;
  return (
    <group>
      <Box s={[l * 0.1, h, w]} p={[-l / 2 + l * 0.05, 0, 0]} c={CATEGORY_COLOR.sensor} />
      <Box s={[l * 0.35, m * 0.75, m * 0.75]} p={[-l / 2 + l * 0.275, 0, 0]} c={K.black} />
      <Cyl d={lensD} len={l * 0.5} p={[l / 2 - l * 0.25, 0, 0]} axis="x" c={K.dark} />
      <Cyl d={lensD * (wide ? 0.9 : 0.65)} len={l * 0.04} p={[l / 2 - l * 0.02 + 0.0001, 0, 0]} axis="x" c={K.glass} look={GLOSS} />
    </group>
  );
}

/** HC-SR04 style: board with two silver transducer "eyes" (they face up: the catalog box is flat). */
export function Ultrasonic({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const t = pcbT(h);
  const top = -h / 2 + t;
  const up = h - t;
  const d = Math.min(w * 0.9, l * 0.4);
  return (
    <group>
      <Pcb s={s} c={CATEGORY_COLOR.sensor} />
      {[-1, 1].map((k) => (
        <group key={k}>
          <Cyl d={d} len={up} p={[k * l * 0.27, top + up / 2, 0]} c={K.silver} look={SILVER} />
          <Cyl d={d * 0.8} len={up * 0.02} p={[k * l * 0.27, top + up + up * 0.01, 0]} c={K.black} />
        </group>
      ))}
      <Box s={[l * 0.12, up * 0.3, w * 0.25]} p={[0, top + up * 0.15, w * 0.25]} c={K.silver} look={SILVER} />
    </group>
  );
}

/** Small IR distance board: PCB with a black emitter/receiver block. */
export function DistanceIR({ s }: { s: V3 }) {
  const [l, h, w] = s;
  const t = pcbT(h);
  const top = -h / 2 + t;
  const up = h - t;
  return (
    <group>
      <Pcb s={s} c={CATEGORY_COLOR.sensor} />
      <Box s={[l * 0.45, up, w * 0.6]} p={[l * 0.15, top + up / 2, 0]} c={K.black} />
      <Header len={l * 0.4} h={up * 0.6} w={w * 0.2} p={[-l * 0.25, top + up * 0.3, 0]} />
    </group>
  );
}

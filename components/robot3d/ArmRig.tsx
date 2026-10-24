"use client";
// TASK B owns this file: arm geometry and extend/retract animation.
// Pose math lives in ./arm/kinematics.ts (pure); this file draws it and springs `extend`.
import { useFrame } from "@react-three/fiber";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import * as THREE from "three";
import type { ArmRig as Rig } from "@/lib/robot3d/layout";
import { armReadout, mastPose, servoPose } from "./arm/kinematics";
import { C, CATEGORY_COLOR } from "./theme";

const JOINT = "#2A2724";
const ROD = "#C9C4BA";
const SPRING_W = 9; // rad/s natural frequency of the critically damped spring (~0.5 s settle)

/* prefers-reduced-motion as an external store (no setState in effects). */
const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getRM = () => typeof window !== "undefined" && !!window.matchMedia?.(RM_QUERY).matches;
const useReducedMotion = () => useSyncExternalStore(subscribeRM, getRM, () => false);

/** Critically damped spring toward `target`; snaps when reduced motion is on. Calls `apply` with the value. */
function useSpring(target: number, resetKey: unknown, apply: (v: number) => void) {
  const reduced = useReducedMotion();
  const s = useRef({ x: target, v: 0, applied: Number.NaN });
  const applyRef = useRef(apply);
  useLayoutEffect(() => { applyRef.current = apply; });
  // Apply once before first paint (and whenever the rig changes) so nothing flashes at the origin.
  useLayoutEffect(() => { s.current.applied = s.current.x; applyRef.current(s.current.x); }, [resetKey]);
  useFrame((_, delta) => {
    const st = s.current;
    if (reduced) {
      st.x = target; st.v = 0;
    } else if (Math.abs(target - st.x) > 1e-4 || Math.abs(st.v) > 1e-4) {
      // Semi-implicit Euler in small steps; stable for any frame time.
      let left = Math.min(delta, 0.1);
      while (left > 0) {
        const dt = Math.min(left, 1 / 120);
        st.v += (SPRING_W * SPRING_W * (target - st.x) - 2 * SPRING_W * st.v) * dt;
        st.x += st.v * dt;
        left -= dt;
      }
    } else {
      st.x = target; st.v = 0;
    }
    if (st.x !== st.applied) { st.applied = st.x; applyRef.current(st.x); }
  });
}

/** Faint dashed line from the tool tip to the floor, in theme blue. */
function useDropLine() {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = new THREE.LineDashedMaterial({ color: C.blue, dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0.55 });
    const l = new THREE.Line(g, m);
    l.raycast = () => {}; // never steal clicks
    return l;
  }, []);
  // Free GPU buffers on unmount. Under StrictMode's dev remount three.js re-uploads on the next render.
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return line;
}
function setDropLine(line: THREE.Line | null, x: number, y: number, z: number, floorY: number) {
  if (!line) return;
  const a = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  a.setXYZ(0, x, y, z);
  a.setXYZ(1, x, floorY, z);
  a.needsUpdate = true;
  line.geometry.computeBoundingSphere();
  line.computeLineDistances();
}

/**
 * Draws the arm at rig.mount. `extend` is 0 (retracted) to 1 (fully extended).
 * `tool` is rendered at the arm tip (the caller passes the tool mesh, already selectable).
 */
export function ArmRig({ rig, extend, tool }: { rig: Rig; extend: number; tool?: ReactNode }) {
  return rig.extendable
    ? <MastArm rig={rig} extend={extend} tool={tool} />
    : <ServoArm rig={rig} extend={extend} tool={tool} />;
}

/* Linear actuator mast: outer tube, telescoping rod, pitching servo wrist with the tool on its end. */
function MastArm({ rig, extend, tool }: { rig: Rig; extend: number; tool?: ReactNode }) {
  const [bx, tubeH, bz] = rig.baseSize;
  const rodR = Math.max(0.004, Math.min(bx, bz) * 0.22);
  const servo: [number, number, number] = [Math.min(0.04, bx * 0.8), 0.022, Math.min(0.03, bz * 0.8)];
  const linkW = Math.min(0.02, bz * 0.45);
  const linkT = 0.006;
  const rodRef = useRef<THREE.Mesh>(null);
  const wristRef = useRef<THREE.Group>(null);
  const linkRef = useRef<THREE.Mesh>(null);
  const toolRef = useRef<THREE.Group>(null);
  const line = useDropLine();
  const lineRef = useRef<THREE.Line>(null);

  useSpring(extend, rig, (v) => {
    const p = mastPose(rig, v);
    // Rod runs from inside the tube up to the underside of the wrist servo.
    const bottom = tubeH * 0.4, top = Math.max(bottom + 0.01, p.rodTop - servo[1]);
    rodRef.current?.position.set(0, (bottom + top) / 2, 0);
    rodRef.current?.scale.set(1, top - bottom, 1);
    wristRef.current?.position.set(0, p.rodTop, 0);
    wristRef.current?.rotation.set(0, 0, p.wristPitch);
    linkRef.current?.scale.set(p.wristLen, 1, 1);
    linkRef.current?.position.set(p.wristLen / 2, -linkT / 2, 0);
    toolRef.current?.position.set(p.tip[0], p.tip[1], p.tipZ);
    setDropLine(lineRef.current, p.tip[0], p.tip[1], p.tipZ, -rig.mount[1]);
  });

  return (
    <group position={rig.mount}>
      {/* Outer tube with a darker collar at the top. */}
      <mesh position={[0, tubeH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bx, tubeH, bz]} />
        <meshStandardMaterial color={CATEGORY_COLOR.arm} roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0, tubeH - 0.006, 0]}>
        <boxGeometry args={[bx * 1.08, 0.012, bz * 1.08]} />
        <meshStandardMaterial color={JOINT} roughness={0.6} />
      </mesh>
      {/* Inner rod (unit height, scaled by the spring). */}
      <mesh ref={rodRef} castShadow>
        <cylinderGeometry args={[rodR, rodR, 1, 20]} />
        <meshStandardMaterial color={ROD} roughness={0.25} metalness={0.8} />
      </mesh>
      {/* Wrist: servo body under the pivot plus a flat link reaching out to the tool. */}
      <group ref={wristRef}>
        <mesh position={[0, -servo[1] / 2, 0]} castShadow>
          <boxGeometry args={servo} />
          <meshStandardMaterial color={JOINT} roughness={0.5} />
        </mesh>
        <mesh position={[0, -servo[1] / 2, 0]}>
          <cylinderGeometry args={[servo[2] * 0.35, servo[2] * 0.35, servo[1] + 0.004, 16]} />
          <meshStandardMaterial color={C.gold} roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh ref={linkRef} castShadow>
          <boxGeometry args={[1, linkT, linkW]} />
          <meshStandardMaterial color={CATEGORY_COLOR.arm} roughness={0.45} metalness={0.35} />
        </mesh>
      </group>
      <group ref={toolRef}>{tool}</group>
      <primitive ref={lineRef} object={line} />
    </group>
  );
}

/* Fixed servo arm: turret, shoulder link, elbow link; folds from rest to reach. */
function ServoArm({ rig, extend, tool }: { rig: Rig; extend: number; tool?: ReactNode }) {
  const geo = useMemo(() => servoPose(rig, 1), [rig]);
  const [bx, , bz] = rig.baseSize;
  const turretR = Math.max(0.015, Math.min(bx, bz) * 0.4);
  const linkW = Math.max(0.012, Math.min(0.03, turretR * 0.7));
  const linkT = linkW * 0.45;
  const jointR = linkW * 0.7;
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const toolRef = useRef<THREE.Group>(null);
  const line = useDropLine();
  const lineRef = useRef<THREE.Line>(null);

  useSpring(extend, rig, (v) => {
    const p = servoPose(rig, v);
    shoulderRef.current?.rotation.set(0, 0, p.shoulder);
    elbowRef.current?.rotation.set(0, 0, p.elbow);
    toolRef.current?.position.set(p.tip[0], p.tip[1], 0);
    setDropLine(lineRef.current, p.tip[0], p.tip[1], 0, -rig.mount[1]);
  });

  const joint = (
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[jointR, jointR, linkW * 1.5, 20]} />
      <meshStandardMaterial color={JOINT} roughness={0.5} />
    </mesh>
  );

  return (
    <group position={rig.mount}>
      {/* Turret: wide base plate plus a column up to the shoulder. */}
      <mesh position={[0, 0.006, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[turretR * 1.3, turretR * 1.3, 0.012, 28]} />
        <meshStandardMaterial color={JOINT} roughness={0.6} />
      </mesh>
      <mesh position={[0, geo.shoulderY / 2, 0]} castShadow>
        <cylinderGeometry args={[turretR * 0.8, turretR, geo.shoulderY, 24]} />
        <meshStandardMaterial color={CATEGORY_COLOR.arm} roughness={0.5} metalness={0.3} />
      </mesh>
      <group ref={shoulderRef} position={[0, geo.shoulderY, 0]}>
        {joint}
        <mesh position={[geo.l1 / 2, 0, 0]} castShadow>
          <boxGeometry args={[geo.l1, linkT, linkW]} />
          <meshStandardMaterial color={CATEGORY_COLOR.arm} roughness={0.45} metalness={0.35} />
        </mesh>
        <group ref={elbowRef} position={[geo.l1, 0, 0]}>
          {joint}
          <mesh position={[geo.l2 / 2, 0, 0]} castShadow>
            <boxGeometry args={[geo.l2, linkT, linkW * 0.85]} />
            <meshStandardMaterial color={CATEGORY_COLOR.arm} roughness={0.45} metalness={0.35} />
          </mesh>
          <mesh position={[geo.l2, 0, 0]}>
            <sphereGeometry args={[jointR * 0.75, 16, 12]} />
            <meshStandardMaterial color={C.gold} roughness={0.4} metalness={0.4} />
          </mesh>
        </group>
      </group>
      <group ref={toolRef}>{tool}</group>
      <primitive ref={lineRef} object={line} />
    </group>
  );
}

/**
 * HTML overlay control for extend/retract. Rendered outside the Canvas by RobotScene.
 * Pass `rig` to also show the reach and lift (tool mount above the deck) in mm.
 */
export function ArmControls({ extend, onExtend, rig }: { extend: number; onExtend: (v: number) => void; rig?: Rig }) {
  const id = useId();
  const out = rig ? armReadout(rig, extend) : null;
  const extended = extend >= 0.5;
  const pct = Math.round(extend * 100);
  return (
    <div
      className="arm-controls"
      role="group"
      aria-label="Arm controls"
      style={{
        position: "absolute", left: 12, bottom: 12, zIndex: 1,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        maxWidth: "calc(100% - 24px)", padding: "8px 10px",
        background: "rgba(21, 20, 18, 0.88)", border: "1px solid #2A2724", borderRadius: 8,
        color: C.ink, font: "12px/1.2 system-ui, sans-serif", backdropFilter: "blur(6px)",
      }}
    >
      <label htmlFor={id} style={{ color: C.muted, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11 }}>Arm</label>
      <input
        id={id} type="range" min={0} max={1} step={0.01} value={extend}
        aria-valuetext={out ? `${pct}% extended, reach ${out.reachMm} mm, arm lift ${out.liftMm} mm above deck` : `${pct}% extended`}
        onChange={(e) => onExtend(Number(e.target.value))}
        style={{ width: 120, accentColor: C.gold, cursor: "pointer" }}
      />
      <button
        type="button"
        onClick={() => onExtend(extended ? 0 : 1)}
        aria-label="Extend arm"
        aria-pressed={extended}
        style={{
          padding: "4px 10px", borderRadius: 6, cursor: "pointer", font: "inherit",
          color: C.bg, background: C.gold, border: "1px solid " + C.gold,
        }}
      >
        {extended ? "Retract" : "Extend"}
      </button>
      {out && (
        <span title="Tool mount height above the deck (catalog liftMaxMm). The tool adds about 50 mm on top." style={{ color: C.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          reach <span style={{ color: C.blue }}>{out.reachMm}</span> mm · arm lift <span style={{ color: C.blue }}>{out.liftMm}</span> mm
        </span>
      )}
    </div>
  );
}

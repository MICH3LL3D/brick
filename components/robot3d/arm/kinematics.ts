// Pure arm pose math (no three.js). Frame: metres, relative to rig.mount, y up, x forward, z left.
import type { ArmRig } from "@/lib/robot3d/layout";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Linear actuator mast: outer tube, telescoping rod, wrist link that swings the tool forward. */
export type MastPose = {
  kind: "mast";
  tubeH: number;         // outer tube height
  rodTop: number;        // top of the inner rod (wrist pivot height)
  wristLen: number;      // wrist link length (= reachMaxM)
  wristPitch: number;    // rad about +z; 0 = level and straight forward, >0 folds the tip up over the mast
  tip: [number, number]; // tool mount point [x forward, y up]
  tipZ: number;          // always 0: the wrist swings in the robot's centre plane
};

/** Fixed servo arm: turret, shoulder link, elbow link. */
export type ServoPose = {
  kind: "servo";
  shoulderY: number;     // shoulder pivot height (top of turret)
  l1: number;
  l2: number;
  shoulder: number;      // rad from +x toward +y
  elbow: number;         // rad, relative to link 1 (negative bends down)
  elbowPt: [number, number];
  tip: [number, number];
  tipZ: number;          // always 0: a servo arm works in its own vertical plane
};

export type ArmPose = MastPose | ServoPose;

export function mastPose(rig: ArmRig, extend: number): MastPose {
  const t = clamp01(extend);
  const tubeH = rig.baseSize[1];
  const lift = Math.max(tubeH, rig.liftMaxM);
  const rodTop = lerp(tubeH, lift, t);
  const wristLen = Math.max(rig.reachMaxM, 0.02);
  // Reach x = L cos(pitch): at t=0 the wrist is folded up so the tool sits over the mast (x = reachMin),
  // at t=1 it is level and straight ahead (x = reachMax, tip at liftMaxM). The fold is capped so the tip
  // never rises above liftMaxM (short-stroke masts then rest a little further forward than reachMin).
  const minRatio = Math.min(1, Math.max(0, rig.reachMinM) / wristLen);
  const headroom = Math.min(1, Math.max(0, (lift - rodTop) / wristLen));
  const pitch = Math.min(lerp(Math.acos(minRatio), 0, t), Math.asin(headroom));
  return {
    kind: "mast", tubeH, rodTop, wristLen, wristPitch: pitch,
    tip: [wristLen * Math.cos(pitch), rodTop + wristLen * Math.sin(pitch)], tipZ: 0,
  };
}

/** Link lengths and the two key poses for a fixed servo arm. */
function servoGeometry(rig: ArmRig) {
  const shoulderY = rig.baseSize[1];
  const R = Math.max(rig.reachMaxM, 0.04);
  const H = Math.max(rig.liftMaxM, shoulderY + 0.02);
  const dx = R, dy = H - shoulderY;
  const d = Math.hypot(dx, dy);
  // Equal links a bit longer than half the distance, so the reaching pose keeps a visible elbow.
  const l1 = d * 0.56, l2 = d * 0.56;
  // Two-link IK, elbow up.
  const cosE = (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  const elbowReach = -Math.acos(Math.min(1, Math.max(-1, cosE)));
  const shoulderReach = Math.atan2(dy, dx) - Math.atan2(l2 * Math.sin(elbowReach), l1 + l2 * Math.cos(elbowReach));
  // Folded rest: shoulder leaning back past vertical, elbow folded forward and down.
  const shoulderRest = Math.PI * 0.62;
  const elbowRest = -Math.PI * 0.8;
  return { shoulderY, l1, l2, shoulderReach, elbowReach, shoulderRest, elbowRest };
}

export function servoPose(rig: ArmRig, extend: number): ServoPose {
  const t = clamp01(extend);
  const g = servoGeometry(rig);
  const shoulder = lerp(g.shoulderRest, g.shoulderReach, t);
  const elbow = lerp(g.elbowRest, g.elbowReach, t);
  const elbowPt: [number, number] = [g.l1 * Math.cos(shoulder), g.shoulderY + g.l1 * Math.sin(shoulder)];
  const a = shoulder + elbow;
  const tip: [number, number] = [elbowPt[0] + g.l2 * Math.cos(a), elbowPt[1] + g.l2 * Math.sin(a)];
  return { kind: "servo", shoulderY: g.shoulderY, l1: g.l1, l2: g.l2, shoulder, elbow, elbowPt, tip, tipZ: 0 };
}

export function armPose(rig: ArmRig, extend: number): ArmPose {
  return rig.extendable ? mastPose(rig, extend) : servoPose(rig, extend);
}

/**
 * Live numbers for the overlay, in mm: forward reach and arm lift (tool-mount height above the deck),
 * i.e. the same quantities as the catalog's reachMm and liftMaxMm. derive.ts adds a 50 mm tool allowance on top.
 */
export function armReadout(rig: ArmRig, extend: number): { reachMm: number; liftMm: number } {
  const p = armPose(rig, extend);
  return { reachMm: Math.round(p.tip[0] * 1000), liftMm: Math.round(p.tip[1] * 1000) };
}

"use client";
// Shared building blocks for the procedural part meshes: one unit box and a few unit cylinders,
// scaled per use, and a material cache keyed by look. Nothing here allocates per render.
import { createContext, useContext } from "react";
import * as THREE from "three";
import { C } from "../theme";

export type V3 = [number, number, number];

/** Unit geometries (1 m box; cylinders of diameter 1, height 1 along y). */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const CYL_HI = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
const CYL_LO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const BOX_EDGES = new THREE.EdgesGeometry(BOX);
const SELECT_LINE = new THREE.LineBasicMaterial({ color: C.select });

export type Look = { metal?: number; rough?: number; opacity?: number };

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Cached standard material. `selected` adds a gold emissive glow. */
export function mat(color: string, look: Look = {}, selected = false): THREE.MeshStandardMaterial {
  const { metal = 0.1, rough = 0.7, opacity = 1 } = look;
  const key = `${color}|${metal}|${rough}|${opacity}|${selected ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    const see = opacity < 1;
    m = new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough,
      transparent: see, opacity, depthWrite: !see,
      emissive: selected ? C.select : "#000000", emissiveIntensity: selected ? 0.35 : 0,
    });
    cache.set(key, m);
  }
  return m;
}

/** True inside a selected part: every primitive below switches to the glowing material. */
export const Selected = createContext(false);

const ROT: Record<"x" | "y" | "z", V3> = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };
const noRaycast = () => {};

/** Box of size `s` centred at `p`. */
export function Box({ s, p, r, c, look }: { s: V3; p?: V3; r?: V3; c: string; look?: Look }) {
  const sel = useContext(Selected);
  const see = (look?.opacity ?? 1) < 1;
  return <mesh geometry={BOX} material={mat(c, look, sel)} scale={s} position={p} rotation={r} castShadow={!see} receiveShadow={!see} />;
}

/** Cylinder of diameter `d` and length `len` along `axis`, centred at `p`. */
export function Cyl(props: { d: number; len: number; p?: V3; axis?: "x" | "y" | "z"; c: string; look?: Look; detail?: "lo" | "hi" }) {
  const { d, len, p, axis = "y", c, look, detail } = props;
  const sel = useContext(Selected);
  const see = (look?.opacity ?? 1) < 1;
  const geo = detail === "lo" ? CYL_LO : detail === "hi" ? CYL_HI : CYL;
  return <mesh geometry={geo} material={mat(c, look, sel)} scale={[d, len, d]} position={p} rotation={ROT[axis]} castShadow={!see} receiveShadow={!see} />;
}

/** Thin gold outline around a selected part's bounding box. Not clickable. */
export function SelectBox({ size }: { size: V3 }) {
  const pad = 0.004;
  return <lineSegments geometry={BOX_EDGES} material={SELECT_LINE} scale={[size[0] + pad, size[1] + pad, size[2] + pad]} raycast={noRaycast} />;
}

/** Common colours for parts that are not the category tint. */
export const K = {
  black: "#141312",
  rubber: "#1A1816",
  metal: "#9C978F",
  silver: "#C9C5BE",
  gold: "#D4AF37",
  dark: "#2A2724",
  glass: "#0E2A3A",
  tube: "#D9D4CB",
  water: "#3187A0",
  bottle: "#CFE3EA",
} as const;

export const SILVER: Look = { metal: 0.8, rough: 0.35 };
export const GLOSS: Look = { metal: 0.6, rough: 0.15 };

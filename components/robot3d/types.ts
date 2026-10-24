import type { Part } from "@/lib/contracts";
import type { Layers } from "../LayersPanel";

/**
 * Same props as the 2D RobotPreview so Playground can swap viewers.
 * In 3D, an offset is a move on the deck plane in millimetres: x forward, y to the robot's left.
 */
export type Offsets = Record<string, { x: number; y: number }>;

export type SceneProps = {
  parts: Part[];
  layers: Layers;
  selectedId: string | null;
  offsets: Offsets;
  onSelect: (id: string | null) => void;
  onMove: (id: string, o: { x: number; y: number }) => void;
};

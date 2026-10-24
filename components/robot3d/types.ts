import type { Part } from "@/lib/contracts";
import type { Layers } from "../LayersPanel";

/** Same props as the 2D RobotPreview so Playground can swap viewers. */
export type SceneProps = {
  parts: Part[];
  layers: Layers;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

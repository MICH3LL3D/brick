// Colours shared by the 3D viewer. Matches the 2D schematic palette in RobotPreview.tsx.
export const C = {
  ink: "#1A1714",
  muted: "#5E574D",
  gold: "#F5C518",
  blue: "#2B6FC2",
  bg: "#F6F1E6",
  panel: "#FFFDF8",
  select: "#D1352B",
} as const;

/** Base colour per catalog category. */
export const CATEGORY_COLOR: Record<string, string> = {
  chassis: "#E8E3D9",
  controller: "#2F6B4F",
  motor_driver: "#5B3A8C",
  arm: "#D6D0C4",
  tool: "#3187A0",
  sensor: "#B5523B",
  power: "#C8A56A",
  misc: "#4A4640",
};

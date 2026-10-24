// Colours shared by the 3D viewer. Matches the 2D schematic palette in RobotPreview.tsx.
export const C = {
  ink: "#F2EDE4",
  muted: "#A39B90",
  gold: "#C8A56A",
  blue: "#3187A0",
  bg: "#0B0A09",
  panel: "#151412",
  select: "#C8A56A",
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

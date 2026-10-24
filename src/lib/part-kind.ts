// Which drawing a part gets in the manuals when it has no verified photo (see components/PartArt.tsx).
import type { Part } from "./contracts";

export type PartKind = "chassis" | "controller" | "driver" | "arm" | "pump" | "tank" | "ultrasonic" | "camera" | "sensor" | "battery" | "regulator" | "board";

export function kindOf(p: Pick<Part, "id" | "category" | "name" | "caps">): PartKind {
  const text = `${p.id} ${p.name}`.toLowerCase();
  if ((p.caps.tankMl ?? 0) > 0) return "tank";
  if ((p.caps.pumpMlPerS ?? 0) > 0 || /pump/.test(text)) return "pump";
  switch (p.category) {
    case "chassis": return "chassis";
    case "controller": return "controller";
    case "motor_driver": return "driver";
    case "arm": return "arm";
    case "power": return (p.caps.batteryWh ?? 0) > 0 ? "battery" : "regulator";
    case "sensor": return /ultra|hc-sr|rcwl|sonar/.test(text) ? "ultrasonic" : p.caps.interface === "csi" || /camera/.test(text) ? "camera" : "sensor";
    case "tool": return /gripper|claw/.test(text) ? "arm" : "board";
    default: return "board";
  }
}


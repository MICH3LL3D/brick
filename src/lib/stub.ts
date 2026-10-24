// Stand-in data typed by contracts.ts, used until B's /api routes land. Delete once they do.
import type { z } from "zod";
import type { Design, Part } from "./contracts";
import { Check, Derived, Room, SimResult, Task } from "./contracts";

export type Checks = z.infer<typeof Check>;
export type DerivedT = z.infer<typeof Derived>;
export type RoomT = z.infer<typeof Room>;
export type SimT = z.infer<typeof SimResult>;

export type TaskT = z.infer<typeof Task>;

// task and limitations come from /api/generate; older cached results may lack them.
export type Result = { design: Design; derived: DerivedT; sim: SimT; task?: TaskT; limitations?: string[] };

const part = (id: string, category: Part["category"], name: string, priceUsd: number, vendor: string, verified: boolean, caps: Part["caps"] = {}): Part => ({
  id, category, name, priceUsd, vendor, verified, caps,
  url: `https://example.com/${id}`,
  dims: { l: 0, w: 0, h: 0 }, massG: 0, mounts: [], notes: "",
});

export const STUB_CATALOG: Part[] = [
  part("chassis-4wd-m", "chassis", "4WD medium chassis", 54, "Pololu", true, { wheels: 4 }),
  part("chassis-2wd-s", "chassis", "2WD small chassis", 32, "Pololu", true, { wheels: 2 }),
  part("controller-pi5", "controller", "Raspberry Pi 5, 4GB", 60, "Adafruit", true),
  part("arm-linear", "arm", "Linear actuator arm", 89, "Actuonix", false, { reachMm: { min: 120, max: 420 } }),
  part("arm-servo", "arm", "Servo arm", 41, "Adafruit", true, { reachMm: { min: 200, max: 200 } }),
];

const REASONS: Record<string, string> = {
  "chassis-4wd-m": "Carries the tank without tipping",
  "chassis-2wd-s": "Cheapest base that fits the doorways",
  "controller-pi5": "Runs the route and camera",
  "arm-linear": "Reaches the high shelf plant",
  "arm-servo": "Cheap fixed arm for low targets",
};

export const STUB_ROOM: RoomT = {
  name: "Sample apartment", widthMm: 4000, depthMm: 3000,
  obstacles: [
    { id: "couch", label: "couch", x: 2400, y: 2100, w: 1400, d: 700, h: 800 },
    { id: "desk", label: "desk", x: 200, y: 200, w: 1200, d: 600, h: 750 },
  ],
  doorways: [{ x: 4000, y: 1500, widthMm: 800 }],
  home: { x: 300, y: 1500 },
  targets: [{ id: "fern", label: "fern on the shelf", x: 3200, y: 600, heightMm: 1300, action: "water" }],
};

export function stubResult(budgetUsd: number): Result {
  const rich = budgetUsd >= 200;
  const partIds = ["chassis-4wd-m", "controller-pi5", rich ? "arm-linear" : "arm-servo"];
  const reach = rich ? 420 : 200;
  const checks: Checks[] = [
    { id: "reach", ok: reach >= 420, message: reach >= 420 ? "The arm reaches the shelf (420 mm)." : "The arm tops out at 200 mm, so it cannot reach the fern at 1300 mm." },
    { id: "pin-budget", ok: true, message: "All parts fit on the Pi's pins." },
    { id: "battery", ok: rich ? false : true, message: rich ? "Battery covers 38 minutes, but the task needs about 45." : "Battery covers the whole task." },
  ];
  const design: Design = { summary: "A 4-wheel robot with a tank and arm.", partIds, reasons: Object.fromEntries(partIds.map((i) => [i, REASONS[i]])), routine: [], budgetUsd };
  return {
    design,
    derived: { totalUsd: total(partIds), totalMassG: 0, footprint: { l: 0, w: 0 }, checks, pinMap: [] },
    sim: {
      success: reach >= 420, checks,
      path: [{ x: 300, y: 1500, t: 0 }, { x: 1800, y: 1500, t: 6 }, { x: 3000, y: 800, t: 12 }, { x: 300, y: 1500, t: 22 }],
      events: [{ t: 12, targetId: "fern", op: "water", ok: reach >= 420, note: reach >= 420 ? "Watered the fern" : "Arm too short for the shelf" }],
      batteryUsedPct: 38, durationS: 22,
    },
  };
}

export const total = (ids: string[]) => ids.reduce((s, i) => s + (STUB_CATALOG.find((p) => p.id === i)?.priceUsd ?? 0), 0);

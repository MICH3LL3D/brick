// Records data/cache/*.json for the 3 demo prompts.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/record-cache.ts      real Gemini runs
//   npx tsx --conditions=react-server scripts/record-cache.ts --hand-built               offline placeholders
// Hand-built entries are marked origin:"hand-built" and should be replaced by real runs before the demo.
import type { Design } from "../src/lib/contracts";
import { loadCatalog, loadRoom, type Task } from "../src/lib/data";
import { readCache, writeCache } from "../src/lib/demo-cache";
import { generateDesign } from "../src/lib/generate";

type Seed = { prompt: string; budgetUsd: number; task: Task; design: Omit<Design, "budgetUsd"> };

const SEEDS: Seed[] = [
  {
    prompt: "Water my plants",
    budgetUsd: 500,
    task: { prompt: "Water my plants", targetIds: ["plant-floor", "plant-table", "plant-shelf"] },
    design: {
      summary: "A sturdy 4-wheel waterer with a lift mast tall enough for the bookshelf succulent.",
      partIds: ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "arm-lact10p", "tool-pump-peristaltic", "tank-500", "bat-nimh-2200", "reg-5v-3a", "adc-ads1115"],
      reasons: {
        "chassis-4wd-m": "Four wheels carry the lift mast and a full water tank without tipping.",
        "pi4b-4gb": "The cheaper Pi has plenty of power for driving and pumping.",
        "md-motor-hat": "Four motor channels cover both wheel sides, the lift and the pump over two I2C pins.",
        "arm-lact10p": "The 10-inch lift raises the nozzle to the 650 mm bookshelf plant.",
        "tool-pump-peristaltic": "A self-priming pump gives small, measured splashes of water.",
        "tank-500": "500 ml waters all three plants with room to spare.",
        "bat-nimh-2200": "One 7.2V pack runs the motors and feeds the Pi regulator.",
        "reg-5v-3a": "Steps the battery down to the steady 5V 3A the Pi needs.",
        "adc-ads1115": "Reads the lift's position sensor, since the Pi has no analog inputs.",
      },
      routine: [
        { op: "goto", target: "plant-floor" }, { op: "pump_on", value: 3 }, { op: "pump_off" },
        { op: "goto", target: "plant-table" }, { op: "extend_arm", value: 300 }, { op: "pump_on", value: 3 }, { op: "pump_off" }, { op: "retract_arm" },
        { op: "goto", target: "plant-shelf" }, { op: "extend_arm", value: 550 }, { op: "pump_on", value: 3 }, { op: "pump_off" }, { op: "retract_arm" },
        { op: "return_home" },
      ],
    },
  },
  {
    prompt: "Bring my water bottle from the desk to the couch",
    budgetUsd: 500,
    task: { prompt: "Bring my water bottle from the desk to the couch", targetIds: ["bottle-desk", "couch-drop"] },
    design: {
      summary: "A 4-wheel fetcher with a 12-inch lift and a gripper that carries your bottle to the couch.",
      partIds: ["chassis-4wd-m", "pi4b-4gb", "md-motor-hat", "arm-lact12p", "tool-gripper", "servo-pca9685", "bat-nimh-2200", "reg-5v-3a", "adc-ads1115"],
      reasons: {
        "chassis-4wd-m": "Four wheels stay steady while lifting a full bottle.",
        "pi4b-4gb": "Enough computing for the trip, at the lower price.",
        "md-motor-hat": "Drives the wheels and the lift actuator from two I2C pins.",
        "arm-lact12p": "The 12-inch lift reaches the 760 mm desk top.",
        "tool-gripper": "Servo jaws wide enough to hold a water bottle.",
        "servo-pca9685": "Drives the gripper servo with clean timing.",
        "bat-nimh-2200": "Powers the motors and the Pi regulator for the round trip.",
        "reg-5v-3a": "Gives the Pi a steady 5V 3A.",
        "adc-ads1115": "Reads the lift's position so it stops at the right height.",
      },
      routine: [
        { op: "goto", target: "bottle-desk" }, { op: "extend_arm", value: 650 }, { op: "grip" }, { op: "retract_arm" },
        { op: "goto", target: "couch-drop" }, { op: "extend_arm", value: 350 }, { op: "release" }, { op: "retract_arm" },
        { op: "return_home" },
      ],
    },
  },
  {
    prompt: "Patrol the apartment and take photos of the windows",
    budgetUsd: 300,
    task: { prompt: "Patrol the apartment and take photos of the windows", targetIds: ["window-living", "window-office"] },
    design: {
      summary: "A light 2-wheel patroller with a wide camera that snaps both windows.",
      partIds: ["chassis-2wd-m", "pi4b-4gb", "md-tb6612", "cam-pi3-wide", "us-rcwl1601", "bat-nimh-2200", "reg-5v-3a"],
      reasons: {
        "chassis-2wd-m": "A small round base turns in place and fits the narrow doorway easily.",
        "pi4b-4gb": "Runs the camera and driving code at the lower price.",
        "md-tb6612": "A cheap dual driver is all two wheels need.",
        "cam-pi3-wide": "The 120 degree lens gets a whole window in one shot.",
        "us-rcwl1601": "Spots walls and furniture so the robot stops in time.",
        "bat-nimh-2200": "Enough charge for a full lap of the apartment.",
        "reg-5v-3a": "Gives the Pi a steady 5V 3A from the battery.",
      },
      routine: [
        { op: "goto", target: "window-living" }, { op: "photograph", target: "window-living" },
        { op: "goto", target: "window-office" }, { op: "photograph", target: "window-office" },
        { op: "return_home" },
      ],
    },
  },
];

async function main() {
  const handBuilt = process.argv.includes("--hand-built");
  const room = loadRoom();
  const catalog = loadCatalog();

  for (const seed of SEEDS) {
    if (handBuilt) {
      writeCache({
        prompt: seed.prompt,
        recordedAt: new Date().toISOString(),
        origin: "hand-built",
        task: seed.task,
        design: { ...seed.design, budgetUsd: seed.budgetUsd },
        attempts: 1,
        repairNotes: [],
      });
    } else {
      const t0 = Date.now();
      let res;
      try {
        res = await generateDesign(seed.prompt, seed.budgetUsd, room, catalog);
      } catch (e) {
        console.error(`"${seed.prompt}": FAILED, kept the existing cache entry. ${(e as Error).message.slice(0, 160)}`);
        continue;
      }
      console.log(`"${seed.prompt}": ${res.attempts} attempt(s), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      writeCache({
        prompt: seed.prompt,
        recordedAt: new Date().toISOString(),
        origin: "gemini",
        task: res.task,
        design: res.design,
        attempts: res.attempts,
        repairNotes: res.repairNotes,
      });
    }
    const back = readCache(seed.prompt, room, catalog)!;
    const failed = back.derived.checks.filter((c) => !c.ok);
    console.log(
      `  $${back.derived.totalUsd} | checks ${failed.length ? "FAILED: " + failed.map((c) => c.id).join(", ") : "all pass"} | sim ${back.sim.success ? "success" : "fail"}`,
    );
    for (const c of failed) console.log(`    - ${c.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

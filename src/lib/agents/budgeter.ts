// Picks one option per specialist. Code does the money (PLAN rule); Gemini never sums prices.
import type { Part } from "../contracts";
import { sumUsd } from "../money";

export type Option = { partIds: string[]; reasons: { partId: string; reason: string }[]; tradeoff: string };
export type Posture = "tight" | "normal" | "generous";

export const optionCost = (o: Option, price: Map<string, number>) => sumUsd(o.partIds.map((id) => price.get(id) ?? 0));
export const priceMap = (catalog: Part[]) => new Map(catalog.map((p) => [p.id, p.priceUsd]));

/**
 * `groups` are in upgrade-priority order, each sorted cheapest first. Starts at the cheapest of every
 * group (the budget is a target, not a wall: if that already exceeds `limitUsd`, it is still returned),
 * then spends headroom on upgrades one step at a time. "tight" never upgrades; "normal" upgrades at most
 * one step per group; "generous" upgrades as far as the money goes.
 */
export function pickOptions(groups: Option[][], limitUsd: number, posture: Posture, price: Map<string, number>): number[] {
  const cost = (g: number, i: number) => optionCost(groups[g][i], price);
  const pick = groups.map(() => 0);
  const total = () => sumUsd(pick.map((i, g) => cost(g, i)));
  if (posture === "tight") return pick;
  const maxStep = posture === "normal" ? 1 : Infinity;
  for (let progressed = true; progressed; ) {
    progressed = false;
    for (let g = 0; g < groups.length; g++) {
      const next = pick[g] + 1;
      if (next >= groups[g].length || next > maxStep) continue;
      if (sumUsd([total(), cost(g, next) - cost(g, pick[g])]) <= limitUsd) {
        pick[g] = next;
        progressed = true;
      }
    }
  }
  return pick;
}

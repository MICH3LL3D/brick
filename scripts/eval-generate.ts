// Eval harness for the prompt -> design pipeline. Scores each prompt in data/eval/prompts.json so
// prompt or model changes can be compared run to run.
//
// Usage (needs GEMINI_API_KEY; imports server-only modules, hence the react-server condition):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/eval-generate.ts [flags]
//
// Flags:
//   --requirements-only   only run extractRequirements (1 cheap call per prompt); skips part rules
//   --only <substring>    run prompts whose id or text contains the substring (case-insensitive)
//   --limit N             run at most N prompts (after --only)
//   --timeout-ms N        per-prompt timeout (default 120000; 30000 with --requirements-only)
//   --out <path>          JSON results file (default: <os.tmpdir()>/eval-generate-<timestamp>.json)
//
// Scoring per prompt:
//   feasible       requirements.feasible matches expect.feasible (when given)
//   needs          each expect.needs key: number within [min, max] inclusive, boolean equal
//   include        each expect.mustInclude rule: some part has that category or an id in anyOf
//   exclude        no part matches an expect.mustNotInclude entry (part id, "prefix-*", or category)
//   ok/attempts    from generateDesign; cost = derived.totalUsd vs budgetUsd
// Prompts run sequentially. A timed-out prompt is scored as an error; its call is not cancelled.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Part } from "../src/lib/contracts";
import { loadCatalog, loadRoom } from "../src/lib/data";
import { extractRequirements, generateDesign, type GenerateResult } from "../src/lib/generate";
import type { RequirementsT } from "../src/lib/requirements";

type Range = [number, number];
type Needs = Partial<Record<keyof RequirementsT, Range | boolean>>;
type IncludeRule = { category?: string; anyOf?: string[] };
type EvalCase = {
  id: string;
  prompt: string;
  budgetUsd: number;
  expect: { feasible?: boolean; needs?: Needs; mustInclude?: IncludeRule[]; mustNotInclude?: string[] };
};
type CheckResult = { kind: "feasible" | "needs" | "include" | "exclude" | "budget" | "ok"; name: string; pass: boolean; detail: string };
type CaseResult = {
  id: string;
  prompt: string;
  budgetUsd: number;
  latencyMs: number;
  error?: string;
  requirements?: RequirementsT;
  partIds?: string[];
  totalUsd?: number;
  ok?: boolean;
  attempts?: number;
  failedChecks?: string[];
  limitations?: string[];
  checks: CheckResult[];
};

/* ---------- Args ---------- */

function parseArgs(argv: string[]) {
  const args = { requirementsOnly: false, only: "", limit: Infinity, timeoutMs: 0, out: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--requirements-only") args.requirementsOnly = true;
    else if (a === "--only") args.only = next().toLowerCase();
    else if (a === "--limit") args.limit = Number(next());
    else if (a === "--timeout-ms") args.timeoutMs = Number(next());
    else if (a === "--out") args.out = next();
    else throw new Error(`Unknown flag ${a}`);
  }
  if (!args.timeoutMs) args.timeoutMs = args.requirementsOnly ? 30_000 : 120_000;
  if (!args.out) args.out = path.join(os.tmpdir(), `eval-generate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  return args;
}

/* ---------- Scoring ---------- */

function matches(part: Part, pattern: string): boolean {
  if (pattern.endsWith("*")) return part.id.startsWith(pattern.slice(0, -1));
  return part.id === pattern || part.category === pattern;
}

function scoreRequirements(c: EvalCase, req: RequirementsT): CheckResult[] {
  const out: CheckResult[] = [];
  if (c.expect.feasible !== undefined) {
    out.push({ kind: "feasible", name: "feasible", pass: req.feasible === c.expect.feasible, detail: `got ${req.feasible}, want ${c.expect.feasible}` });
  }
  for (const [key, want] of Object.entries(c.expect.needs ?? {}) as [keyof RequirementsT, Range | boolean][]) {
    const got = req[key];
    const pass = Array.isArray(want) ? typeof got === "number" && got >= want[0] && got <= want[1] : got === want;
    const wantText = Array.isArray(want) ? `[${want[0]}, ${want[1]}]` : String(want);
    out.push({ kind: "needs", name: key, pass, detail: `got ${JSON.stringify(got)}, want ${wantText}` });
  }
  return out;
}

function scoreDesign(c: EvalCase, res: GenerateResult, catalog: Part[]): CheckResult[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const parts = res.design.partIds.map((id) => byId.get(id)).filter((p): p is Part => !!p);
  const out: CheckResult[] = [];
  for (const rule of c.expect.mustInclude ?? []) {
    const name = rule.category ? `category:${rule.category}` : `anyOf:${(rule.anyOf ?? []).join("|")}`;
    const pass = parts.some((p) => (rule.category ? p.category === rule.category : false) || (rule.anyOf ?? []).includes(p.id));
    out.push({ kind: "include", name, pass, detail: pass ? "present" : "missing" });
  }
  for (const pattern of c.expect.mustNotInclude ?? []) {
    const hits = parts.filter((p) => matches(p, pattern)).map((p) => p.id);
    out.push({ kind: "exclude", name: pattern, pass: hits.length === 0, detail: hits.length ? `has ${hits.join(", ")}` : "absent" });
  }
  out.push({ kind: "budget", name: "budget", pass: res.derived.totalUsd <= c.budgetUsd, detail: `$${res.derived.totalUsd} of $${c.budgetUsd}` });
  out.push({ kind: "ok", name: "ok", pass: res.ok, detail: res.ok ? "all checks pass" : `failed: ${res.derived.checks.filter((k) => !k.ok).map((k) => k.id).join(", ")}` });
  return out;
}

/* ---------- Runner ---------- */

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

async function runCase(c: EvalCase, requirementsOnly: boolean, timeoutMs: number, catalog: Part[]): Promise<CaseResult> {
  const started = Date.now();
  const base = { id: c.id, prompt: c.prompt, budgetUsd: c.budgetUsd };
  try {
    if (requirementsOnly) {
      const req = await withTimeout(extractRequirements(c.prompt), timeoutMs);
      return { ...base, latencyMs: Date.now() - started, requirements: req, checks: scoreRequirements(c, req) };
    }
    const res = await withTimeout(generateDesign(c.prompt, c.budgetUsd, loadRoom(), catalog), timeoutMs);
    const req = res.task.requirements;
    return {
      ...base,
      latencyMs: Date.now() - started,
      requirements: req,
      partIds: res.design.partIds,
      totalUsd: res.derived.totalUsd,
      ok: res.ok,
      attempts: res.attempts,
      failedChecks: res.derived.checks.filter((k) => !k.ok).map((k) => `${k.id}: ${k.message}`),
      limitations: res.limitations,
      checks: [...(req ? scoreRequirements(c, req) : []), ...scoreDesign(c, res, catalog)],
    };
  } catch (e) {
    return { ...base, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e), checks: [] };
  }
}

/* ---------- Report ---------- */

function frac(checks: CheckResult[], kind: CheckResult["kind"]): string {
  const xs = checks.filter((k) => k.kind === kind);
  return xs.length ? `${xs.filter((k) => k.pass).length}/${xs.length}` : "-";
}

function printTable(results: CaseResult[], requirementsOnly: boolean) {
  const cols = requirementsOnly
    ? ["id", "feas", "needs", "sec", "status"]
    : ["id", "feas", "needs", "incl", "excl", "ok", "att", "sec", "cost/budget", "status"];
  const rows = results.map((r) => {
    const feas = r.checks.find((k) => k.kind === "feasible");
    const cells: Record<string, string> = {
      id: r.id,
      feas: feas ? (feas.pass ? "pass" : "FAIL") : "-",
      needs: frac(r.checks, "needs"),
      incl: frac(r.checks, "include"),
      excl: frac(r.checks, "exclude"),
      ok: r.ok === undefined ? "-" : r.ok ? "yes" : "no",
      att: r.attempts === undefined ? "-" : String(r.attempts),
      sec: (r.latencyMs / 1000).toFixed(1),
      "cost/budget": r.totalUsd === undefined ? "-" : `${r.totalUsd.toFixed(0)}/${r.budgetUsd}`,
      status: r.error ? `ERROR ${r.error.slice(0, 40)}` : r.checks.every((k) => k.pass) ? "PASS" : "fail",
    };
    return cols.map((c) => cells[c]);
  });
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((s, i) => s.padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function totals(results: CaseResult[]) {
  const all = results.flatMap((r) => r.checks);
  const ran = results.filter((r) => !r.error);
  const byName = new Map<string, { pass: number; total: number }>();
  for (const k of all) {
    const key = `${k.kind}:${k.name}`;
    const t = byName.get(key) ?? { pass: 0, total: 0 };
    t.total++;
    if (k.pass) t.pass++;
    byName.set(key, t);
  }
  const worst = [...byName.entries()]
    .filter(([, t]) => t.pass < t.total)
    .sort((a, b) => (b[1].total - b[1].pass) - (a[1].total - a[1].pass))
    .map(([name, t]) => ({ name, failed: t.total - t.pass, total: t.total }));
  const designs = ran.filter((r) => r.ok !== undefined);
  return {
    prompts: results.length,
    errors: results.length - ran.length,
    fullyPassing: ran.filter((r) => r.checks.every((k) => k.pass)).length,
    checksPassed: all.filter((k) => k.pass).length,
    checksTotal: all.length,
    designsOk: designs.filter((r) => r.ok).length,
    designs: designs.length,
    meanAttempts: designs.length ? designs.reduce((s, r) => s + (r.attempts ?? 0), 0) / designs.length : 0,
    meanLatencyS: ran.length ? ran.reduce((s, r) => s + r.latencyMs, 0) / ran.length / 1000 : 0,
    worst,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const all = JSON.parse(readFileSync(path.join(process.cwd(), "data/eval/prompts.json"), "utf8")) as EvalCase[];
  const cases = all
    .filter((c) => !args.only || c.id.toLowerCase().includes(args.only) || c.prompt.toLowerCase().includes(args.only))
    .slice(0, args.limit);
  const catalog = loadCatalog();
  console.log(`Running ${cases.length} prompt(s)${args.requirementsOnly ? " (requirements only)" : ""}, timeout ${args.timeoutMs} ms each.\n`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id} ... `);
    const r = await runCase(c, args.requirementsOnly, args.timeoutMs, catalog);
    results.push(r);
    console.log(r.error ? `error (${r.error})` : `${r.checks.filter((k) => k.pass).length}/${r.checks.length} in ${(r.latencyMs / 1000).toFixed(1)}s`);
  }

  console.log("");
  printTable(results, args.requirementsOnly);
  const t = totals(results);
  console.log(`\nTotals: ${t.fullyPassing}/${t.prompts} prompts fully pass, ${t.checksPassed}/${t.checksTotal} checks pass, ${t.errors} error(s), mean ${t.meanLatencyS.toFixed(1)}s` +
    (t.designs ? `, ${t.designsOk}/${t.designs} designs ok, mean ${t.meanAttempts.toFixed(2)} attempts` : ""));
  if (t.worst.length) {
    console.log("Most failed expectations:");
    for (const w of t.worst.slice(0, 8)) console.log(`  ${w.name}  ${w.failed}/${w.total}`);
  }
  const failures = results.flatMap((r) => r.checks.filter((k) => !k.pass).map((k) => `  ${r.id}  ${k.kind}:${k.name}  ${k.detail}`));
  if (failures.length) console.log(`Failures:\n${failures.join("\n")}`);

  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify({ ranAt: new Date().toISOString(), args: { ...args, limit: Number.isFinite(args.limit) ? args.limit : null }, totals: t, results }, null, 2));
  console.log(`\nWrote ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

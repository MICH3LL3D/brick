// Gate: every generated .py file must pass `python -m py_compile` before the kit is zipped.
import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { KitFile } from "./pi";

const run = promisify(execFile);

/** Returns a list of compile errors (empty = all good). Throws if no Python is installed. */
export async function pyCompileErrors(files: KitFile[]): Promise<string[]> {
  const py = files.filter((f) => f.path.endsWith(".py"));
  if (!py.length) return [];
  const dir = await mkdtemp(join(tmpdir(), "kit-"));
  try {
    for (const f of py) {
      const target = join(dir, f.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, f.content);
    }
    const python = await findPython();
    const errors: string[] = [];
    for (const f of py) {
      try {
        await run(python, ["-m", "py_compile", join(dir, f.path)], { timeout: 15_000 });
      } catch (e) {
        errors.push(`${f.path}: ${((e as { stderr?: string }).stderr || (e as Error).message).trim().split("\n").slice(-2).join(" ")}`);
      }
    }
    return errors;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function findPython(): Promise<string> {
  for (const bin of ["python3", "python"]) {
    try {
      await run(bin, ["--version"], { timeout: 5_000 });
      return bin;
    } catch {
      /* try the next one */
    }
  }
  throw new Error("Python is not installed, so the kit's code cannot be compile-checked.");
}

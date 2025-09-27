// src/lib/synthea.ts
import path from "node:path";
import fs from "node:fs";
import { SyntheaSpec } from "./schema";

export function sanitizeLocation(input?: string | null): string | undefined {
  if (!input) return undefined;
  const cleaned = input.replace(/[^a-zA-Z .'-]/g, "").trim();
  return cleaned || undefined;
}

export function buildSyntheaArgs(spec: SyntheaSpec, baseDir: string): string[] {
  const args: string[] = [];

  if (spec.seed) args.push("-s", String(spec.seed));
  if (spec.population) args.push("-p", String(spec.population));
  if (spec.gender && spec.gender !== "Any") args.push("-g", spec.gender);
  if (spec.age) args.push("-a", `${spec.age.min}-${spec.age.max}`);

  // Ensure CSV export + set output base dir (Synthea will create baseDir/csv)
  args.push("--exporter.csv.export=true");
  args.push(`--exporter.baseDirectory=${path.resolve(baseDir)}`);

  // State + city must be the LAST args per run_synthea usage
  const state = sanitizeLocation(spec.state);
  const city = sanitizeLocation(spec.city);
  if (state) args.push(state);
  if (state && city) args.push(city);

  return args;
}

/**
 * Resolve the executable we will call:
 * 1) SYNTHEA_RUN_SCRIPT (absolute path) if provided and exists
 * 2) repo wrapper at <repo-root>/run-synthea.sh (or .bat on Windows)
 * 3) run_synthea inside SYNTHEA_DIR/SYNTHEA_PATH
 * Throws with a clear message if nothing is found.
 */
export function getRunScript(): string {
  // 1) explicit override
  const override = process.env.SYNTHEA_RUN_SCRIPT;
  if (override && fs.existsSync(override)) return override;

  // 2) repo wrapper
  const repoRoot = process.cwd();
  const wrapper =
    process.platform === "win32"
      ? path.join(repoRoot, "run-synthea.bat")
      : path.join(repoRoot, "run-synthea.sh");
  if (fs.existsSync(wrapper)) return wrapper;

  // 3) direct script in Synthea repo
  const base = process.env.SYNTHEA_DIR || process.env.SYNTHEA_PATH;
  if (base) {
    const file = process.platform === "win32" ? "run_synthea.bat" : "run_synthea";
    const script = path.join(base, file);
    if (fs.existsSync(script)) return script;
  }

  throw new Error(
    "Cannot locate Synthea run script. Provide one of:\n" +
      " - SYNTHEA_RUN_SCRIPT=/abs/path/to/wrapper-or-run_synthea\n" +
      " - Place run-synthea.sh at the repo root\n" +
      " - Set SYNTHEA_DIR (or SYNTHEA_PATH) to your Synthea folder"
  );
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

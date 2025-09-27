import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";           // allow Node APIs
export const dynamic = "force-dynamic";    // don't cache
export const maxDuration = 300;            // let Java finish locally

type RunBody = {
  population?: number;   // -p
  seed?: number;         // -s
  state?: string;        // optional: override default state
  modules?: string[];    // -m comma-separated list, e.g. ["oncology"]
};

function need(name: string, v?: string) {
  if (!v) throw new Error(`Server misconfiguration: ${name} env var is not set`);
  return v;
}

export async function POST(req: Request) {
  try {
    const SYNTHEA_PATH = need("SYNTHEA_PATH", process.env.SYNTHEA_PATH);
    const SYNTHEA_JAR = process.env.SYNTHEA_JAR || "synthea-with-dependencies.jar";
    const JAVA_BIN = process.env.JAVA_BIN || "java";
    const APP_OUT = process.env.SYNTHEA_OUTPUT_DIR || join(process.cwd(), "synthea-output");

    const { population = 250, seed, state, modules = [] } =
      ((await req.json().catch(() => ({}))) as RunBody) || {};

    // Synthea writes to <SYNTHEA_PATH>/output/* by default — clean it for a fresh run
    const syntheaOut = join(SYNTHEA_PATH, "output");
    await rm(syntheaOut, { recursive: true, force: true });

    // Build CLI args
    const args = ["-jar", SYNTHEA_JAR, "-p", String(population)];
    if (seed != null) args.push("-s", String(seed));
    if (state) args.push("-a", state);              // or rely on generate.default_state
    if (modules.length) args.push("-m", modules.join(","));

    // Run Synthea with cwd = SYNTHEA_PATH so it uses config/synthea.properties
    const child = spawn(JAVA_BIN, args, { cwd: SYNTHEA_PATH, env: process.env });

    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));

    const exitCode: number = await new Promise(res => child.on("close", res));
    if (exitCode !== 0) {
      return NextResponse.json({ error: "Synthea failed", exitCode, stdout, stderr }, { status: 500 });
    }

    // Copy CSVs to a stable, timestamped directory inside your app output
    const stamp = Date.now().toString();
    const runDir = join(APP_OUT, `run-${stamp}`);
    await mkdir(runDir, { recursive: true });
    await cp(join(syntheaOut, "csv"), join(runDir, "csv"), { recursive: true });

    return NextResponse.json({
      ok: true,
      population, state, modules,
      csvDir: join(runDir, "csv"),
      tail: stdout.split("\n").slice(-20), // last lines
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

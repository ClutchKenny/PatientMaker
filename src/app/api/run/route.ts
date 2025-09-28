// app/api/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import archiver from "archiver";
import { z } from "zod";
import { SyntheaSpecSchema } from "@/lib/schema";
import { buildSyntheaArgs, ensureDir, getRunScript } from "@/lib/synthea";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow an optional cohortLabel for folder/UX naming
const SpecWithLabel = SyntheaSpecSchema.extend({
  cohortLabel: z.string().optional(),
});

async function zipDir(dir: string, zipPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    output.on("close", () => resolve());
    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jobId: string = body.jobId || "nojid";
    const base = `/tmp/synthea/${jobId}`;
    ensureDir(base);

    // Accept either single spec or multi-run
    let runsInput: unknown[] = [];
    if (Array.isArray(body.runs)) {
      runsInput = body.runs;
    } else if (body.spec) {
      runsInput = [body.spec];
    } else {
      return NextResponse.json(
        { error: "Provide either { spec } or { runs: [...] }" },
        { status: 400 }
      );
    }

    // Validate each run
    const parsedRuns = runsInput.map((r, i) => {
      const parsed = SpecWithLabel.safeParse(r);
      if (!parsed.success) {
        throw new Error(
          `Invalid spec at index ${i}: ${parsed.error.toString()}`
        );
      }
      return parsed.data;
    });

    if (!process.env.SYNTHEA_DIR) {
      return NextResponse.json(
        { error: "Server misconfiguration: SYNTHEA_DIR env var is not set" },
        { status: 500 }
      );
    }
    const cmd = getRunScript();
    const cwd = process.env.SYNTHEA_DIR!;

    const results: Array<{
      cohort: string;
      files: string[];
      stdoutTail: string;
      stderrTail: string;
      zip?: string;
    }> = [];

    // Run sequentially to avoid clobbering ./output in Synthea
    for (let i = 0; i < parsedRuns.length; i++) {
      const spec = parsedRuns[i];
      const label = spec.cohortLabel ?? `cohort_${i + 1}`;
      const outDir = path.join(base, label);
      ensureDir(outDir);

      // Avoid passing cohortLabel into build args
      const { cohortLabel, ...specForArgs } = spec as any;

      const args = buildSyntheaArgs(specForArgs, outDir);

      let stdout = "";
      let stderr = "";
      try {
        const r = await execFileAsync(cmd, args, {
          cwd,
          timeout: 1000 * 60 * 5, // 5 min per cohort
          maxBuffer: 1024 * 1024 * 32,
        });
        stdout = r.stdout ?? "";
        stderr = r.stderr ?? "";
      } catch (err: any) {
        stdout = err?.stdout ?? "";
        stderr = err?.stderr ?? "";
        return NextResponse.json(
          {
            error: `Synthea execution failed for ${label}`,
            details: err?.message ?? String(err),
            stdoutTail: stdout.slice(-2000),
            stderrTail: stderr.slice(-2000),
          },
          { status: 500 }
        );
      }

      // Expect CSVs in <outDir>/csv
      const csvDir = path.join(outDir, "csv");
      const files = fs.existsSync(csvDir)
        ? fs
            .readdirSync(csvDir)
            .filter((f) => f.endsWith(".csv"))
            .map((f) => path.join(csvDir, f))
        : [];

      if (files.length === 0) {
        return NextResponse.json(
          {
            error: `No CSV files found for ${label}. Ensure exporter.csv.export=true.`,
            stdoutTail: stdout.slice(-2000),
            stderrTail: stderr.slice(-2000),
          },
          { status: 500 }
        );
      }

      // Zip each cohort's CSVs
      const zipPath = path.join(outDir, `${label}.zip`);
      await zipDir(csvDir, zipPath);

      results.push({
        cohort: label,
        files: files.map((f) => path.basename(f)),
        stdoutTail: stdout.slice(-2000),
        stderrTail: stderr.slice(-2000),
        zip: `/api/download?job=${encodeURIComponent(
          jobId
        )}&cohort=${encodeURIComponent(label)}`,
      });
    }

    // Optional: zip the entire job folder (all cohorts)
    const bundleZip = path.join(base, `all_cohorts.zip`);
    await zipDir(base, bundleZip);

    return NextResponse.json({
      ok: true,
      jobId,
      runsCount: parsedRuns.length,
      cohorts: results,
      bundleUrl: `/api/download?job=${encodeURIComponent(jobId)}&all=1`,
      note:
        "Each cohort was generated in its own folder under /tmp/synthea/<jobId>/<cohortLabel>.",
    });
  } catch (err: any) {
    console.error("Unhandled /api/run error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.SYNTHEA_OUTPUT_DIR || join(process.cwd(), "synthea-output");
  try {
    const entries = await readdir(base, { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter(d => d.isDirectory() && d.name.startsWith("run-"))
        .map(async d => {
          const full = join(base, d.name);
          const s = await stat(full);
          return { run: d.name, mtimeMs: s.mtimeMs };
        })
    );
    runs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return NextResponse.json({ base, runs });
  } catch {
    return NextResponse.json({ base, runs: [] });
  }
}

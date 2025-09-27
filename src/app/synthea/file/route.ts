import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const relPath = url.searchParams.get("path"); // e.g. run-<ts>/csv/patients.csv
    if (!relPath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

    const base = process.env.SYNTHEA_OUTPUT_DIR || join(process.cwd(), "synthea-output");
    const safe = normalize(join(base, relPath));
    if (!safe.startsWith(normalize(base))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const info = await stat(safe);
    if (!info.isFile()) return NextResponse.json({ error: "Not a file" }, { status: 400 });

    const stream = createReadStream(safe);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safe.split("/").pop()}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Read error" }, { status: 500 });
  }
}

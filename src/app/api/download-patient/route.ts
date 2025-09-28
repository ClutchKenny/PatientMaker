// src/app/api/download-patient/route.ts
import type { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { PassThrough } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const job = searchParams.get("job");
    const patient = searchParams.get("patient"); // optional; if missing we zip ALL patients

    if (!job) {
      return jsonErr("Missing job", 400);
    }

    const base = `/tmp/synthea/${job}`;
    const perPatientDir = path.join(base, "per_patient");
    if (!fs.existsSync(perPatientDir)) {
      return jsonErr(`Not found: ${perPatientDir}`, 404);
    }

    let zipSourceDir: string;
    let zipName: string;

    if (patient) {
      zipSourceDir = path.join(perPatientDir, patient);
      if (!fs.existsSync(zipSourceDir)) {
        return jsonErr(`Patient folder not found: ${patient}`, 404);
      }
      zipName = `patient_${patient}.zip`;
    } else {
      zipSourceDir = perPatientDir;
      zipName = `per_patient_${job}.zip`;
    }

    // Create a Node stream and pipe archiver into it
    const stream = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      // Propagate the error to the HTTP stream
      stream.destroy(err);
    });

    // Start archiving directory
    archive.directory(zipSourceDir, false);
    archive.finalize().catch((e) => stream.destroy(e));

    // Pipe archive bytes into the PassThrough stream
    archive.pipe(stream);

    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        // Optional: disable buffering/proxying
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return jsonErr(err?.message ?? String(err), 500);
  }
}

function jsonErr(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

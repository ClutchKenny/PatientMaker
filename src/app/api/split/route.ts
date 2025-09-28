import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { readCsvAsObjects, writeObjectsAsCsv } from "@/lib/csv-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOMAINS = [
  "patients",
  "encounters",
  "observations",
  "conditions",
  "medications",
  "procedures",
  "immunizations",
  "careplans",
  "allergies",
  "imaging_studies",
  "devices",
];

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const base = `/tmp/synthea/${jobId}`;
    const csvDir = path.join(base, "csv");
    if (!fs.existsSync(csvDir)) {
      return NextResponse.json(
        { error: `CSV directory not found: ${csvDir}` },
        { status: 400 }
      );
    }

    const patientsPath = path.join(csvDir, "patients.csv");
    if (!fs.existsSync(patientsPath)) {
      return NextResponse.json(
        { error: "patients.csv not found; generate cohort first" },
        { status: 400 }
      );
    }

    // Load patient list (Id column)
    const patients = readCsvAsObjects(patientsPath);
    const patientIds = patients.map((p) => p["Id"]).filter(Boolean);

    const outRoot = path.join(base, "per_patient");
    fs.mkdirSync(outRoot, { recursive: true });

    // Preload all domain CSVs (so we read disk once)
    const domainTables: Record<string, Record<string, string>[]> = {};
    for (const name of DOMAINS) {
      const p = path.join(csvDir, `${name}.csv`);
      domainTables[name] = fs.existsSync(p) ? readCsvAsObjects(p) : [];
    }

    // Build an index by patient for each domain to speed up filtering
    const byPatient: Record<
      string,
      Record<string, Record<string, string>[]>
    > = {};
    for (const pid of patientIds) {
      byPatient[pid] = {};
    }

    for (const name of DOMAINS) {
      const rows = domainTables[name];
      if (name === "patients") {
        for (const r of rows) {
          const pid = r["Id"];
          if (pid && byPatient[pid]) {
            (byPatient[pid][name] ??= []).push(r);
          }
        }
      } else {
        // most tables use PATIENT foreign key
        for (const r of rows) {
          const pid = r["PATIENT"];
          if (pid && byPatient[pid]) {
            (byPatient[pid][name] ??= []).push(r);
          }
        }
      }
    }

    // Write per-patient folders with CSVs
    const summary: Array<{ patient: string; files: string[] }> = [];
    for (const pid of patientIds) {
      const patientDir = path.join(outRoot, pid);
      fs.mkdirSync(patientDir, { recursive: true });

      const written: string[] = [];

      for (const name of DOMAINS) {
        const rows = byPatient[pid][name] ?? [];
        // Always write patients.csv (single row) for context; others only if present
        if (name === "patients" || rows.length > 0) {
          const out = path.join(patientDir, `${name}.csv`);
          writeObjectsAsCsv(out, rows);
          written.push(`${name}.csv`);
        }
      }

      summary.push({ patient: pid, files: written });
    }

    return NextResponse.json({
      outputDir: outRoot,
      patientCount: patientIds.length,
      patientIds,
      sample: summary.slice(0, 5),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

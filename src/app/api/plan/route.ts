// app/api/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { SyntheaSpecSchema } from "@/lib/schema";
import { buildSyntheaArgs } from "@/lib/synthea";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const model = google("gemini-2.5-flash");

/** Extend spec with a label purely for UX/folders. */
const SpecWithLabel = SyntheaSpecSchema.extend({
  cohortLabel: z.string().optional(),
});

const MultiRunSchema = z.object({
  runs: z.array(SpecWithLabel).min(1),
  notes: z.string().optional(),
});

const PlanningSchema = z.union([SpecWithLabel, MultiRunSchema]);

/** Utility: detect gender keywords in a string */
function scanGenderFlags(s: string) {
  const txt = s.toLowerCase();
  const hasM = /\b(male|men|males|boys)\b/.test(txt);
  const hasF = /\b(female|women|females|girls)\b/.test(txt);
  return { hasM, hasF };
}

/** If exactly one class is present, return it; otherwise "Any" (no override). */
function inferSingleGenderOrAny(p: string): "M" | "F" | "Any" {
  const { hasM, hasF } = scanGenderFlags(p);
  if (hasM && !hasF) return "M";
  if (!hasM && hasF) return "F";
  return "Any";
}

/** Pull out allergy/condition hints as notes (non-functional unless you wire modules). */
function inferNotes(p: string): string | undefined {
  const s = p.toLowerCase();
  // simple pattern; you can expand this list
  const allergyMatch = s.match(/\b([a-z]+)\s+allerg(?:y|ies)\b/);
  if (allergyMatch) {
    const which = allergyMatch[1];
    return `Requested allergy/condition: ${which} allergy`;
  }
  if (s.includes("allergies")) return "Requested allergies present";
  return undefined;
}

/**
 * Advanced heuristic: handle mixed-gender cohort prompts.
 * Examples it supports:
 *  - "generate 2 cohorts ... one with 5 men and one with 5 women"
 *  - "5 men and 5 women" (implicit two cohorts)
 */
function parseMixedGenderCohorts(prompt: string): Array<z.infer<typeof SpecWithLabel>> | null {
  const s = prompt.toLowerCase();
  const notes = inferNotes(prompt);

  // Case A: "one with 5 men ... one with 5 women"
  let m = s.match(/one\s+with\s+(\d+)\s*(men|male|males|boys).+?one\s+with\s+(\d+)\s*(women|female|females|girls)/i);
  if (m) {
    const n1 = parseInt(m[1], 10);
    const n2 = parseInt(m[3], 10);
    if (Number.isFinite(n1) && Number.isFinite(n2)) {
      return [
        { population: n1, gender: "M", cohortLabel: "cohort_1", notes },
        { population: n2, gender: "F", cohortLabel: "cohort_2", notes },
      ] as Array<z.infer<typeof SpecWithLabel>>;
    }
  }

  // Case B: "... 5 men and 5 women ..." (order may vary)
  m = s.match(/(\d+)\s*(men|male|males|boys).+?(\d+)\s*(women|female|females|girls)/i);
  if (m) {
    const n1 = parseInt(m[1], 10);
    const n2 = parseInt(m[3], 10);
    if (Number.isFinite(n1) && Number.isFinite(n2)) {
      return [
        { population: n1, gender: "M", cohortLabel: "cohort_1", notes },
        { population: n2, gender: "F", cohortLabel: "cohort_2", notes },
      ] as Array<z.infer<typeof SpecWithLabel>>;
    }
  }

  // Case C: reversed order "5 women and 5 men"
  m = s.match(/(\d+)\s*(women|female|females|girls).+?(\d+)\s*(men|male|males|boys)/i);
  if (m) {
    const n1 = parseInt(m[1], 10);
    const n2 = parseInt(m[3], 10);
    if (Number.isFinite(n1) && Number.isFinite(n2)) {
      return [
        { population: n1, gender: "F", cohortLabel: "cohort_1", notes },
        { population: n2, gender: "M", cohortLabel: "cohort_2", notes },
      ] as Array<z.infer<typeof SpecWithLabel>>;
    }
  }

  return null;
}

/** Basic fan-out: "5 cohorts of 10 men" / "3 groups of 25 female" */
function heuristicMultiParse(userPrompt: string) {
  const re = /(\d+)\s*(cohorts?|groups?)\s*of\s*(\d+)\s*(male|men|males|boys|female|women|females|girls)?/i;
  const m = userPrompt.match(re);
  if (!m) return null;
  const numCohorts = parseInt(m[1], 10);
  const per = parseInt(m[3], 10);
  const gRaw = (m[4] || "").toLowerCase();
  const notes = inferNotes(userPrompt);

  const gender: "M" | "F" | "Any" =
    /\b(male|men|males|boys)\b/.test(gRaw) ? "M" :
    /\b(female|women|females|girls)\b/.test(gRaw) ? "F" :
    "Any";

  return Array.from({ length: numCohorts }, (_, i) => ({
    population: per,
    gender,
    cohortLabel: `cohort_${i + 1}`,
    notes,
  })) as Array<z.infer<typeof SpecWithLabel>>;
}

const SYSTEM_PROMPT = [
  "You convert natural language cohort requests into a Synthea run plan.",
  "Prefer US locations. If a city is mentioned, include its state.",
  'If unspecified, default population = 100, gender = "Any", no age limits.',
  "If the user asks for multiple cohorts/groups, return { runs: [...] } and include cohortLabel for each.",
  "Return ONLY JSON matching the provided schema.",
].join(" ");

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 1) Ask the model for a plan (single or multi)
    const { object: plan } = await generateObject({
      model,
      schema: PlanningSchema,
      system: SYSTEM_PROMPT,
      prompt,
    });

    // 2) Normalize to an array
    let runs: z.infer<typeof SpecWithLabel>[];
    let notes: string | undefined = undefined;

    if ("runs" in plan) {
      runs = plan.runs;
      notes = plan.notes;
    } else {
      runs = [plan];
    }

    // 2a) If we only got one run, try to parse a mixed-gender instruction like "one with 5 men and one with 5 women"
    if (runs.length === 1) {
      const mixed = parseMixedGenderCohorts(prompt);
      if (mixed) {
        runs = mixed;
      } else {
        // fallback: "N cohorts of K men" style
        const h = heuristicMultiParse(prompt);
        if (h) runs = h;
      }
    }

    // 2b) If prompt mentions exactly ONE gender class, override "Any" with that single class.
    const inferred = inferSingleGenderOrAny(prompt);
    if (inferred !== "Any") {
      runs = runs.map((r) => ({
        ...r,
        gender: r.gender === "Any" ? inferred : r.gender,
      }));
    }
    // If prompt mentions both male and female, we don't override here — either LLM or mixed parser handled it.

    // 2c) If we inferred notes (e.g., allergies) and any run lacks notes, attach it
    const sharedNotes = inferNotes(prompt);
    if (sharedNotes) {
      runs = runs.map((r) => ({ ...r, notes: r.notes ?? sharedNotes }));
      notes = notes ?? sharedNotes;
    }

    // 3) Build command previews (each with its own output dir)
    const jobId = crypto.randomUUID();
    const baseDir = `/tmp/synthea/${jobId}`;

    const commands = runs.map((spec, idx) => {
      const label = spec.cohortLabel ?? `cohort_${idx + 1}`;
      const cohortDir = `${baseDir}/${label}`;
      const specForArgs: any = { ...spec };
      delete specForArgs.cohortLabel;

      const args = buildSyntheaArgs(specForArgs, cohortDir);
      const cmd = `./run_synthea ${args
        .map((a: string) => (a.includes(" ") ? `"${a}"` : a))
        .join(" ")}`;

      return { cohort: label, outDir: cohortDir, command: cmd };
    });

    // 4) Bash script
    const bash = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      `BASE="${baseDir}"`,
      'mkdir -p "$BASE"',
      "",
      ...commands.flatMap(({ cohort, command }) => [
        `echo "=== Generating ${cohort} ==="`,
        `${command}`,
        `if [ -d "output" ]; then`,
        `  rm -rf "$BASE/${cohort}" || true`,
        `  mv output "$BASE/${cohort}"`,
        `fi`,
        `echo "Saved to $BASE/${cohort}"`,
        "echo",
      ]),
      'echo "All cohorts generated under: $BASE"',
      "",
    ].join("\n");

    return NextResponse.json({
      jobId,
      runsCount: runs.length,
      runs,
      commands,
      bash,
      notes,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}

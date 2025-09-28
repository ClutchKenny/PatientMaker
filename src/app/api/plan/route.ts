// app/api/plan/route.ts
import { NextRequest, NextResponse } from "next/server"
import { google } from "@ai-sdk/google"
import { generateObject } from "ai"
import { z } from "zod"
import { SyntheaSpecSchema } from "@/lib/schema"
import { buildSyntheaArgs } from "@/lib/synthea"
import crypto from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Keep your chosen model
const model = google("gemini-2.5-flash")

// Allow either a single spec or a multi-run object { runs: [...] }
const MultiRunSchema = z.object({
  runs: z.array(SyntheaSpecSchema).min(1),
  notes: z.string().optional(),
})

// Union so Gemini can return one or many
const PlanningSchema = z.union([SyntheaSpecSchema, MultiRunSchema])

const SYSTEM_PROMPT = [
  "You convert natural language cohort requests into a Synthea run plan.",
  "Prefer US locations. If a city is mentioned, include its state.",
  "If unspecified, default population=100, gender='Any', no age limits.",
  "Return ONLY JSON matching the schema.",
  "If the user asks for multiple cohorts/groups, return { runs: [...] }.",
].join(" ")

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
    }

    // Ask Gemini to produce either a single spec or { runs: [...] }
    const { object: plan } = await generateObject({
      model,
      schema: PlanningSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })

    // Normalize to an array of specs
    const runs =
      "runs" in plan ? plan.runs : [plan] // plan is either MultiRun or single spec
    const notes = "runs" in plan ? plan.notes : undefined

    // Build command previews for each run, each with its own output base
    const jobId = crypto.randomUUID()
    const baseDir = `/tmp/synthea/${jobId}`

    // Make per-cohort output dirs deterministic: cohort_1, cohort_2, ...
    const commands = runs.map((spec, idx) => {
      const cohortDir = `${baseDir}/cohort_${idx + 1}`
      const args = buildSyntheaArgs(spec, cohortDir)
      const cmd = `./run_synthea ${args
        .map((a: string) => (a.includes(" ") ? `"${a}"` : a))
        .join(" ")}`
      return { cohort: `cohort_${idx + 1}`, outDir: cohortDir, command: cmd }
    })

    // Compose a robust bash script to run sequentially and move output/
    // If buildSyntheaArgs already embeds an output dir flag, we still keep per-cohort dirs distinct.
    const bash = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      `BASE="${baseDir}"`,
      'mkdir -p "$BASE"',
      "",
      ...commands.flatMap(({ cohort, command }) => [
        `echo "=== Generating ${cohort} ==="`,
        // Run Synthea
        `${command}`,
        // If Synthea wrote to a generic ./output dir, move it. If your buildSyntheaArgs already writes into a cohort dir,
        // this mv will be a no-op; keep it for safety across environments.
        `if [ -d "output" ]; then`,
        `  rm -rf "$BASE/${cohort}" || true`,
        `  mv output "$BASE/${cohort}"`,
        `fi`,
        `echo "Saved to $BASE/${cohort}"`,
        "echo",
      ]),
      'echo "All cohorts generated under: $BASE"',
      "",
    ].join("\n")

    return NextResponse.json({
      jobId,
      runsCount: runs.length,
      commands,
      bash,
      notes,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || String(err), stack: err?.stack },
      { status: 500 }
    )
  }
}

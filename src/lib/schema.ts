// lib/schema.ts
import { z } from "zod";

/**
 * Single Synthea spec (your original fields preserved)
 */
export const SyntheaSpecSchema = z.object({
  population: z.number().int().min(1).max(100000).default(100),
  age: z
    .object({
      min: z.number().int().min(0).max(120),
      max: z.number().int().min(0).max(120),
    })
    .refine((v) => v.min <= v.max, "min must be <= max")
    .nullish(),
  gender: z.enum(["M", "F", "Any"]).default("Any"),
  state: z.string().trim().nullish(),
  city: z.string().trim().nullish(),
  seed: z.number().int().nullish(),
  notes: z.string().nullish(), // freeform explanation the model can add
});

/**
 * Optional label used only for organizing outputs (folder name, UI)
 * This is not a Synthea flag; it's for our app.
 */
export const SpecWithLabel = SyntheaSpecSchema.extend({
  cohortLabel: z.string().optional(),
});

/**
 * Multi-run container returned by the planner.
 * `bash` made optional so the planner can omit it (your API can still add it).
 */
export const MultiRunSchema = z.object({
  runs: z.array(SpecWithLabel).min(1),
  bash: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Union: planner may return a single spec or a multi-run object.
 */
export const PlanningSchema = z.union([SpecWithLabel, MultiRunSchema]);

// ---------- Types ----------
export type SyntheaSpec = z.infer<typeof SyntheaSpecSchema>;
export type SpecWithLabelT = z.infer<typeof SpecWithLabel>;
export type MultiRun = z.infer<typeof MultiRunSchema>;
export type Planning = z.infer<typeof PlanningSchema>;

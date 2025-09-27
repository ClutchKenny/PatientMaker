// lib/schema.ts
import { z } from 'zod';


export const SyntheaSpecSchema = z.object({
population: z.number().int().min(1).max(100000).default(100),
age: z
.object({ min: z.number().int().min(0).max(120), max: z.number().int().min(0).max(120) })
.refine(v => v.min <= v.max, 'min must be <= max')
.nullish(),
gender: z.enum(['M', 'F', 'Any']).default('Any'),
state: z.string().trim().nullish(),
city: z.string().trim().nullish(),
seed: z.number().int().nullish(),
notes: z.string().nullish(), // freeform explanation the model can add
});


export type SyntheaSpec = z.infer<typeof SyntheaSpecSchema>;
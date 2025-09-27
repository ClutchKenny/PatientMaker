// lib/synthea.ts
import path from 'node:path';
import fs from 'node:fs';
import { SyntheaSpec } from './schema';


export function sanitizeLocation(input?: string | null): string | undefined {
if (!input) return undefined;
const cleaned = input.replace(/[^a-zA-Z .'-]/g, '').trim();
return cleaned || undefined;
}


export function buildSyntheaArgs(spec: SyntheaSpec, baseDir: string): string[] {
const args: string[] = [];
if (spec.seed) args.push('-s', String(spec.seed));
if (spec.population) args.push('-p', String(spec.population));
if (spec.gender && spec.gender !== 'Any') args.push('-g', spec.gender);
if (spec.age) args.push('-a', `${spec.age.min}-${spec.age.max}`);


// Ensure CSV export + set output base dir
args.push('--exporter.csv.export=true');
args.push(`--exporter.baseDirectory=${path.resolve(baseDir)}`);


// State + city must be the LAST args per run_synthea usage
const state = sanitizeLocation(spec.state);
const city = sanitizeLocation(spec.city);
if (state) args.push(state);
if (state && city) args.push(city);


return args;
}


export function getRunScript(): string {
const dir = process.env.SYNTHEA_DIR;
if (!dir) throw new Error('SYNTHEA_DIR env var is required');
const file = process.platform === 'win32' ? 'run_synthea.bat' : 'run_synthea';
return path.join(dir, file);
}


export function ensureDir(p: string) {
fs.mkdirSync(p, { recursive: true });
}
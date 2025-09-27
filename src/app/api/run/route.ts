// app/api/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import archiver from 'archiver';
import { SyntheaSpecSchema } from '@/lib/schema';
import { buildSyntheaArgs, ensureDir, getRunScript } from '@/lib/synthea';


const execFileAsync = promisify(execFile);
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


async function zipDir(dir: string, zipPath: string) {
await new Promise<void>((resolve, reject) => {
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });
archive.on('error', reject);
output.on('close', () => resolve());
archive.pipe(output);
archive.directory(dir, false);
archive.finalize();
});
}


export async function POST(req: NextRequest) {
const { jobId, spec } = await req.json();
const parsed = SyntheaSpecSchema.safeParse(spec);
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });


const base = `/tmp/synthea/${jobId || 'nojid'}`;
const csvDir = path.join(base, 'csv'); // Synthea will create this
ensureDir(base);


const args = buildSyntheaArgs(parsed.data, base);
// Ensure SYNTHEA_DIR is configured; return JSON error if missing so client gets JSON
if (!process.env.SYNTHEA_DIR) {
	return NextResponse.json({ error: 'Server misconfiguration: SYNTHEA_DIR env var is not set' }, { status: 500 });
}
const cmd = getRunScript();
const cwd = process.env.SYNTHEA_DIR!;


// Run Synthea (give it a generous but finite timeout)
const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout: 1000 * 60 * 3, maxBuffer: 1024 * 1024 * 20 });


// Collect CSVs
const files = fs.existsSync(csvDir)
? fs.readdirSync(csvDir).filter(f => f.endsWith('.csv')).map(f => path.join(csvDir, f))
: [];


if (files.length === 0) {
return NextResponse.json({ error: 'No CSV files found. Ensure exporter.csv.export=true.' }, { status: 500 });
}


const zipPath = path.join(base, 'synthea_csv.zip');
await zipDir(csvDir, zipPath);


return NextResponse.json({
downloadUrl: `/api/download?job=${encodeURIComponent(jobId || 'nojid')}`,
files: files.map(f => path.basename(f)),
stdoutTail: stdout?.slice(-2000) ?? '',
stderrTail: stderr?.slice(-2000) ?? '',
});
}
// app/api/download/route.ts
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';


export const runtime = 'nodejs';


export async function GET(req: NextRequest) {
const job = new URL(req.url).searchParams.get('job') || 'nojid';
const zipPath = path.join('/tmp/synthea', job, 'synthea_csv.zip');
if (!fs.existsSync(zipPath)) {
return new Response('Not found', { status: 404 });
}
const stat = fs.statSync(zipPath);
const stream = fs.createReadStream(zipPath);
return new Response(stream as any, {
headers: {
'Content-Type': 'application/zip',
'Content-Length': String(stat.size),
'Content-Disposition': `attachment; filename="synthea_csv_${job}.zip"`,
},
});
}
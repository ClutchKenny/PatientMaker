// app/api/plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { SyntheaSpecSchema } from '@/lib/schema';
import { buildSyntheaArgs } from '@/lib/synthea';
import crypto from 'node:crypto';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const model = google('gemini-2.5-flash');


export async function POST(req: NextRequest) {
	try {
		const { prompt } = await req.json();
		if (!prompt || typeof prompt !== 'string') {
			return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
		}

		const planningSchema = SyntheaSpecSchema; // reuse zod

		const { object: spec } = await generateObject({
			model,
			schema: planningSchema,
			system:
				'You convert natural language cohort requests into a Synthea run plan. ' +
				'Prefer US locations. If user mentions a city, include its state. ' +
				'If unspecified, default population=100, gender="Any", no age limits. ' +
				'Return ONLY JSON matching the schema.',
			prompt,
		});

		// Preview command (no execution here)
		const jobId = crypto.randomUUID();
		const outBase = `/tmp/synthea/${jobId}`;
		const args = buildSyntheaArgs(spec, outBase);

		return NextResponse.json({ jobId, spec, commandPreview: `run_synthea ${args.map(a => (a.includes(' ') ? '"'+a+'"' : a)).join(' ')}` });
	} catch (err: any) {
		return NextResponse.json({ error: err?.message || String(err), stack: err?.stack }, { status: 500 });
	}
}
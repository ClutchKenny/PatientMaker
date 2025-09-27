'use client';
import { useState } from 'react';


type PlanResp = { jobId: string; spec: any; commandPreview: string };


type RunResp = { downloadUrl: string; files: string[]; stdoutTail: string; stderrTail: string };


export default function Page() {
const [prompt, setPrompt] = useState('Generate 50 patients age 15-20 from Jacksonville, Florida');
const [plan, setPlan] = useState<PlanResp | null>(null);
const [runRes, setRunRes] = useState<RunResp | null>(null);
const [busy, setBusy] = useState(false);
const [error, setError] = useState<string | null>(null);


async function handlePlan() {
setBusy(true);
setError(null);
setRunRes(null);
try {
	const r = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
	if (!r.ok) {
		const txt = await r.text();
		throw new Error(`Plan API error ${r.status}: ${txt}`);
	}
	const ct = r.headers.get('content-type') || '';
	if (ct.includes('application/json')) {
		const j = await r.json();
		setPlan(j);
	} else {
		const txt = await r.text();
		throw new Error(`Expected JSON from plan API but received: ${txt.slice(0, 500)}`);
	}
} catch (err: any) {
	setError(err?.message || String(err));
	setPlan(null);
} finally {
	setBusy(false);
}
}


async function handleRun() {
if (!plan) return;
setBusy(true);
setError(null);
try {
	const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: plan.jobId, spec: plan.spec }) });
	if (!r.ok) {
		const txt = await r.text();
		throw new Error(`Run API error ${r.status}: ${txt}`);
	}
	const ct = r.headers.get('content-type') || '';
	if (ct.includes('application/json')) {
		const j = await r.json();
		setRunRes(j);
	} else {
		const txt = await r.text();
		throw new Error(`Expected JSON from run API but received: ${txt.slice(0, 500)}`);
	}
} catch (err: any) {
	setError(err?.message || String(err));
	setRunRes(null);
} finally {
	setBusy(false);
}
}


return (
<main className="mx-auto max-w-3xl p-6 space-y-6">
<h1 className="text-2xl font-bold">Gemini → Synthea (MVP)</h1>

{error && (
	<div className="rounded p-3 bg-red-50 border border-red-200 text-red-700">{error}</div>
)}


<textarea className="w-full border rounded p-3 min-h-[120px]" value={prompt} onChange={e => setPrompt(e.target.value)} />


<div className="flex gap-3">
	<button onClick={handlePlan} disabled={busy} className="px-4 py-2 rounded bg-black text-white">Plan</button>
	<button onClick={handleRun} disabled={!plan || busy} className="px-4 py-2 rounded bg-blue-600 text-white" title={!plan ? 'You must generate a plan first' : ''}>Run Synthea</button>
</div>

{!plan && (
	<p className="text-sm text-gray-500">Tip: Click "Plan" first. The plan is produced by the agent (Gemini) — look at the Plan section after generating it to confirm the spec and command preview.</p>
)}


{plan && (
<section className="border rounded p-3 space-y-2">
<h2 className="font-semibold">Plan</h2>
<pre className="text-xs bg-gray-50 p-2 overflow-auto">{JSON.stringify(plan.spec, null, 2)}</pre>
<p className="text-sm">Command preview:</p>
<code className="text-xs bg-gray-100 p-1 rounded block overflow-auto">{plan.commandPreview}</code>
</section>
)}


{runRes && (
<section className="border rounded p-3 space-y-2">
<h2 className="font-semibold">CSV Output</h2>
<a className="underline text-blue-600" href={runRes.downloadUrl}>Download ZIP</a>
<ul className="list-disc pl-6 text-sm">
{runRes.files?.map(f => (
<li key={f}>{f}</li>
))}
</ul>
<details>
<summary className="cursor-pointer">Logs (tail)</summary>
<pre className="text-[11px] bg-gray-50 p-2 overflow-auto">STDOUT\n{runRes.stdoutTail}</pre>
<pre className="text-[11px] bg-gray-50 p-2 overflow-auto">STDERR\n{runRes.stderrTail}</pre>
</details>
</section>
)}
</main>
);
}
'use client';
import { useState } from 'react';

type PlanResp = { jobId: string; spec: any; commandPreview: string };
type RunResp = { downloadUrl: string; files: string[]; stdoutTail: string; stderrTail: string };
type SplitResp = {
  outputDir: string;
  patientCount: number;
  sample: Array<{ patient: string; files: string[] }>;
  patientIds?: string[]; // make room for per-patient links
};

export default function Page() {
  const [prompt, setPrompt] = useState('Generate 50 patients age 15-20 from Jacksonville, Florida');
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [runRes, setRunRes] = useState<RunResp | null>(null);
  const [splitRes, setSplitRes] = useState<SplitResp | null>(null);

  const [busy, setBusy] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePlan() {
    setBusy(true);
    setError(null);
    setRunRes(null);
    setSplitRes(null);
    try {
      const r = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) throw new Error(`Plan API error ${r.status}: ${await r.text()}`);
      const j = await r.json();
      setPlan(j);
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
    setSplitRes(null);
    try {
      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: plan.jobId, spec: plan.spec }),
      });
      if (!r.ok) throw new Error(`Run API error ${r.status}: ${await r.text()}`);
      const j = await r.json();
      setRunRes(j);
    } catch (err: any) {
      setError(err?.message || String(err));
      setRunRes(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleSplit() {
    if (!plan) return;
    setSplitBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: plan.jobId }),
      });
      const bodyText = await r.text();
      const j = bodyText ? JSON.parse(bodyText) : {};
      if (!r.ok) throw new Error(`Split API error ${r.status}: ${j.error || bodyText || 'Unknown error'}`);
      setSplitRes(j as SplitResp);
    } catch (err: any) {
      setError(err?.message || String(err));
      setSplitRes(null);
    } finally {
      setSplitBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Gemini → Synthea (MVP)</h1>

      {error && (
        <div className="rounded p-3 bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      <textarea
        className="w-full border rounded p-3 min-h-[120px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePlan}
          disabled={busy}
          className="px-4 py-2 rounded bg-black text-white cursor-pointer hover:opacity-90 disabled:opacity-50"
        >
          Plan
        </button>
        <button
          onClick={handleRun}
          disabled={!plan || busy}
          title={!plan ? 'You must generate a plan first' : ''}
          className="px-4 py-2 rounded bg-blue-600 text-white cursor-pointer hover:bg-blue-700 disabled:opacity-50"
        >
          Run Synthea
        </button>
        <button
          onClick={handleSplit}
          disabled={!plan || !runRes || splitBusy}
          title={!plan ? 'Generate a plan and run Synthea first' : !runRes ? 'Run Synthea first' : ''}
          className="px-4 py-2 rounded bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 disabled:opacity-50"
        >
          {splitBusy ? 'Making patient CSVs…' : 'Make patient-centric CSVs'}
        </button>
      </div>

      {!plan && (
        <p className="text-sm text-gray-500">
          Tip: Click <b>Plan</b> first. Confirm the spec and command preview below, then <b>Run Synthea</b>.
        </p>
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
          <a className="underline text-blue-600 cursor-pointer hover:text-blue-700" href={runRes.downloadUrl}>
            Download ZIP
          </a>
          <ul className="list-disc pl-6 text-sm">
            {runRes.files?.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer">Logs (tail)</summary>
            <pre className="text-[11px] bg-gray-50 p-2 overflow-auto">
              STDOUT{'\n'}{runRes.stdoutTail}
            </pre>
            <pre className="text-[11px] bg-gray-50 p-2 overflow-auto">
              STDERR{'\n'}{runRes.stderrTail}
            </pre>
          </details>
        </section>
      )}

      {splitRes && (
        <section className="border rounded p-3 space-y-2">
          <h2 className="font-semibold">Patient-centric CSVs</h2>
          <p className="text-sm">
            Wrote per-patient folders to: <code>{splitRes.outputDir}</code>
          </p>
          <p className="text-sm">Patients processed: {splitRes.patientCount}</p>

          {/* Bulk zip link of all patient folders */}
          {plan?.jobId && (
            <a
              className="underline text-blue-600 cursor-pointer hover:text-blue-700"
              href={`/api/download-patient?job=${encodeURIComponent(plan.jobId)}`}
            >
              Download ZIP of all patient folders
            </a>
          )}

          {/* Per-patient individual zip links (first 20 for brevity) */}
          {splitRes.patientIds && splitRes.patientIds.length > 0 && plan?.jobId && (
            <>
              <p className="text-sm mt-2">Download individual patients:</p>
              <ul className="list-disc pl-6 text-sm max-h-60 overflow-auto">
                {splitRes.patientIds.slice(0, 20).map((pid) => (
                  <li key={pid}>
                    <a
                      className="underline text-blue-600 cursor-pointer hover:text-blue-700"
                      href={`/api/download-patient?job=${encodeURIComponent(plan.jobId)}&patient=${encodeURIComponent(pid)}`}
                    >
                      {pid}.zip
                    </a>
                  </li>
                ))}
              </ul>
              {splitRes.patientIds.length > 20 && (
                <p className="text-xs text-gray-500">
                  Showing first 20 — use the “all patients” zip above for the full set.
                </p>
              )}
            </>
          )}

          {splitRes.sample?.length > 0 && (
            <>
              <p className="text-sm">Sample:</p>
              <ul className="list-disc pl-6 text-sm">
                {splitRes.sample.map((s) => (
                  <li key={s.patient}>
                    <code>{s.patient}</code> → {s.files.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}

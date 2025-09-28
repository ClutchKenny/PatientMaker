'use client';
import { useState } from 'react';
import { Send, Download, Code, Users, Sparkles, Zap, FileText, Save, Trash2, Menu, X, Edit2, Check, Database, UserCheck } from 'lucide-react';

/** ===== Updated types for Option B (multi-cohort aware) ===== */
type PlanResp = {
  jobId: string;
  runsCount: number;
  runs: any[]; // optionally import your SpecWithLabelT type here
  commands: Array<{ cohort: string; outDir: string; command: string }>;
  bash: string;
  notes?: string;
};

type RunResp = {
  ok: boolean;
  jobId: string;
  runsCount: number;
  cohorts: Array<{
    cohort: string;
    files: string[];
    stdoutTail: string;
    stderrTail: string;
    zip?: string;     // per-cohort zip URL
  }>;
  bundleUrl?: string; // all-cohorts zip URL (optional)
};

type SplitResp = {
  outputDir: string;
  patientCount: number;
  sample: Array<{ patient: string; files: string[] }>;
  patientIds?: string[];
};

type SavedFile = {
  id: string;
  name: string;
  downloadUrl: string;
  files: string[];
  timestamp: Date;
  prompt: string;
  type: 'component' | 'patient';
  splitRes?: SplitResp;
  jobId?: string;
};

export default function Page() {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [runRes, setRunRes] = useState<RunResp | null>(null);
  const [splitRes, setSplitRes] = useState<SplitResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
      const j = (await r.json()) as PlanResp;
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
      const body =
        plan.runsCount > 1
          ? { jobId: plan.jobId, runs: plan.runs }        // multi-cohort
          : { jobId: plan.jobId, spec: plan.runs[0] };    // single cohort

      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Run API error ${r.status}: ${await r.text()}`);
      const j = (await r.json()) as RunResp;
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

  /** Save Component CSVs (supports single or multi-cohort) */
  function handleSaveComponentData() {
    if (!runRes) return;

    const isMulti = runRes.runsCount > 1;
    const nameBase = isMulti ? 'All Cohorts' : 'Component CSVs';
    const filesPreview = isMulti
      ? runRes.cohorts.flatMap(c => c.files).slice(0, 10)
      : (runRes.cohorts[0]?.files ?? []);

    const newFile: SavedFile = {
      id: Date.now().toString(),
      name: `${nameBase} ${savedFiles.filter(f => f.type === 'component').length + 1}`,
      downloadUrl: isMulti
        ? (runRes.bundleUrl ?? runRes.cohorts[0]?.zip ?? '#')
        : (runRes.cohorts[0]?.zip ?? '#'),
      files: filesPreview,
      timestamp: new Date(),
      prompt: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
      type: 'component'
    };

    setSavedFiles(prev => [newFile, ...prev]);
  }

  function handleSavePatientData() {
    if (!splitRes || !plan) return;

    const newFile: SavedFile = {
      id: Date.now().toString(),
      name: `Patient Data ${savedFiles.filter(f => f.type === 'patient').length + 1}`,
      downloadUrl: `/api/download-patient?job=${encodeURIComponent(plan.jobId)}`,
      files: splitRes.sample?.map(s => s.patient + '.zip') || [],
      timestamp: new Date(),
      prompt: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
      type: 'patient',
      splitRes: splitRes,
      jobId: plan.jobId
    };

    setSavedFiles(prev => [newFile, ...prev]);
  }

  function handleDeleteFile(fileId: string) {
    setSavedFiles(prev => prev.filter(f => f.id !== fileId));
  }

  function startEditingName(file: SavedFile) {
    setEditingFileId(file.id);
    setEditingName(file.name);
  }

  function saveFileName(fileId: string) {
    setSavedFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, name: editingName } : f
    ));
    setEditingFileId(null);
    setEditingName('');
  }

  function cancelEditing() {
    setEditingFileId(null);
    setEditingName('');
  }

  function formatTimestamp(date: Date) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-gray-700/50 bg-gray-900/50 backdrop-blur-sm flex-shrink-0`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Saved Datasets</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-gray-800/50 rounded-lg transition-colors lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400">Generated patient datasets</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {savedFiles.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-sm">No saved datasets yet</p>
                <p className="text-gray-500 text-xs mt-1">Generate and save your first dataset</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedFiles.map((file) => (
                  <div key={file.id} className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 hover:bg-gray-800/50 transition-all duration-200 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`p-1 rounded ${file.type === 'patient' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                          {file.type === 'patient'
                            ? <UserCheck className="w-3 h-3 text-emerald-400" />
                            : <Database className="w-3 h-3 text-blue-400" />
                          }
                        </div>
                        {editingFileId === file.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 flex-1 min-w-0"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveFileName(file.id);
                                if (e.key === 'Escape') cancelEditing();
                              }}
                            />
                            <button
                              onClick={() => saveFileName(file.id)}
                              className="p-1 hover:bg-green-500/20 rounded text-green-400"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditingName(file)}
                            className="font-medium text-sm text-white truncate text-left flex-1 hover:text-gray-300 flex items-center gap-1 group/edit"
                          >
                            <span className="truncate">{file.name}</span>
                            <Edit2 className="w-3 h-3 opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-1 hover:bg-red-500/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>

                    <p className="text-xs text-gray-400 mb-3 line-clamp-2">{file.prompt}</p>

                    <div className="space-y-2 mb-3">
                      {file.type === 'patient' && file.splitRes ? (
                        <div className="text-xs text-gray-500">
                          {file.splitRes.patientCount} patients processed
                        </div>
                      ) : (
                        <>
                          {file.files.slice(0, 3).map((fileName, idx) => (
                            <div key={idx} className="text-xs text-gray-500 font-mono truncate">
                              {fileName}
                            </div>
                          ))}
                          {file.files.length > 3 && (
                            <div className="text-xs text-gray-500">
                              +{file.files.length - 3} more files
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(file.timestamp)}
                      </span>
                      <a
                        href={file.downloadUrl}
                        className="inline-flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded-lg transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/50">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 hover:bg-gray-800/50 rounded-lg transition-colors"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-gray-900" />
                </div>
                <h1 className="text-xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Synthease
                </h1>
              </div>

              <div className="flex items-center gap-3">
                {runRes && (
                  <button
                    onClick={handleSaveComponentData}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 hover:border-blue-500/50 text-blue-300 px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105"
                  >
                    <Database className="w-4 h-4" />
                    Save Component CSVs
                  </button>
                )}
                {splitRes && (
                  <button
                    onClick={handleSavePatientData}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105"
                  >
                    <UserCheck className="w-4 h-4" />
                    Save Patient Data
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-full text-sm text-emerald-300 mb-4">
                <Zap className="w-4 h-4" />
                Powered by Gemini AI
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent leading-tight">
              Generate Synthetic<br />Patient Data
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Create realistic patient datasets using AI-powered planning and the Synthea synthetic patient generator
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300">
              <div className="font-medium mb-1">Error occurred</div>
              <div className="text-sm opacity-90">{error}</div>
            </div>
          )}

          {/* Input Section */}
          <div className="mb-8">
            <div className="relative">
              <textarea
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 pr-16 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 backdrop-blur-sm min-h-[120px] shadow-xl"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Ex: Generate 10 male patients ages 15-25 from Jacksonville, Florida"
              />
              <button
                onClick={handlePlan}
                disabled={busy || !prompt.trim()}
                className="absolute bottom-4 right-4 p-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed group"
              >
                {busy ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white group-hover:translate-x-0.5 transition-transform" />
                )}
              </button>
            </div>

            {!plan && (
              <div className="mt-4 flex items-start gap-3 text-gray-400 text-sm">
                <div className="w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                </div>
                <p>Click the send button to generate an AI-powered execution plan. Review the plan before running Synthea.</p>
              </div>
            )}
          </div>

          {/* Plan Section */}
          {plan && (
            <div className="mb-8 bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-gray-700/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <Code className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Execution Plan</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      {plan.runsCount > 1 ? 'Configuration Specs (all cohorts)' : 'Configuration Spec'}
                    </div>
                    <pre className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 text-xs text-gray-300 overflow-auto font-mono">
                      {plan.runsCount > 1
                        ? JSON.stringify(plan.runs, null, 2)
                        : JSON.stringify(plan.runs[0], null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      {plan.runsCount > 1 ? 'Command Previews (all cohorts)' : 'Command Preview'}
                    </div>
                    {plan.runsCount > 1 ? (
                      <div className="space-y-2">
                        {plan.commands.map((c) => (
                          <div key={c.cohort}>
                            <div className="text-xs text-gray-400 mb-1 font-medium">{c.cohort}</div>
                            <code className="block bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 text-xs text-emerald-300 overflow-auto font-mono">
                              {c.command}
                            </code>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <code className="block bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 text-xs text-emerald-300 overflow-auto font-mono">
                        {plan.commands[0]?.command}
                      </code>
                    )}
                  </div>

                  <div>
                    <div className="text-sm text-gray-400 mb-2">Execution Plan (bash)</div>
                    <pre className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 text-xs text-gray-300 overflow-auto font-mono">
                      {plan.bash}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex gap-3">
                  <button
                    onClick={handleRun}
                    disabled={busy}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {busy ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Running Synthea...
                      </>
                    ) : (
                      <>
                        <Users className="w-5 h-5" />
                        Generate Component CSVs
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSplit}
                    disabled={!runRes || splitBusy}
                    title={!runRes ? 'Generate Component CSVs first' : ''}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {splitBusy ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Making Patient CSVs...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-5 h-5" />
                        Make Patient-centric CSVs
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Results Section - Component CSVs */}
          {runRes && (
            <div className="mb-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-sm rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <Database className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Component CSV Output</h3>
                </div>

                <div className="space-y-6">
                  {/* Download all (bundle) if available */}
                  {runRes.bundleUrl && (
                    <div>
                      <a
                        href={runRes.bundleUrl}
                        className="inline-flex items-center gap-3 bg-white text-gray-900 font-medium py-3 px-6 rounded-xl hover:bg-gray-100 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        <Download className="w-5 h-5" />
                        Download All Cohorts (ZIP)
                      </a>
                    </div>
                  )}

                  {/* Per-cohort outputs */}
                  <div className="grid gap-4">
                    {runRes.cohorts.map((c) => (
                      <div key={c.cohort} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-medium text-white">{c.cohort}</div>
                          {c.zip && (
                            <a
                              href={c.zip}
                              className="inline-flex items-center gap-2 text-xs bg-white text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              Download ZIP
                            </a>
                          )}
                        </div>

                        {!!c.files?.length && (
                          <>
                            <div className="text-sm text-gray-400 mb-2">Generated Files</div>
                            <div className="grid gap-2">
                              {c.files.map((f) => (
                                <div key={f} className="bg-gray-900/50 border border-gray-700/50 rounded p-2 text-xs text-gray-300 font-mono">
                                  {f}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <details className="group mt-3">
                          <summary className="cursor-pointer text-gray-300 hover:text-white transition-colors select-none py-1 px-2 rounded hover:bg-gray-900/40">
                            <span className="font-medium text-xs">View Execution Logs</span>
                          </summary>
                          <div className="mt-3 grid gap-3">
                            <div>
                              <div className="text-[11px] text-gray-400 mb-1 font-medium">STDOUT</div>
                              <pre className="bg-gray-900/50 border border-gray-700/50 rounded p-2 text-[11px] text-gray-300 overflow-auto font-mono max-h-40">
                                {c.stdoutTail}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-400 mb-1 font-medium">STDERR</div>
                              <pre className="bg-gray-900/50 border border-gray-700/50 rounded p-2 text-[11px] text-gray-300 overflow-auto font-mono max-h-40">
                                {c.stderrTail}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Section - Patient-centric CSVs */}
          {splitRes && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 backdrop-blur-sm rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Patient-centric CSVs</h3>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Output Directory</div>
                      <code className="text-xs text-gray-300 font-mono">{splitRes.outputDir}</code>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Patients Processed</div>
                      <div className="text-2xl font-bold text-emerald-300">{splitRes.patientCount}</div>
                    </div>
                  </div>

                  <div>
                    {plan?.jobId && (
                      <a
                        href={`/api/download-patient?job=${encodeURIComponent(plan.jobId)}`}
                        className="inline-flex items-center gap-3 bg-white text-gray-900 font-medium py-3 px-6 rounded-xl hover:bg-gray-100 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        <Download className="w-5 h-5" />
                        Download All Patient Folders (ZIP)
                      </a>
                    )}
                  </div>

                  {splitRes.patientIds && splitRes.patientIds.length > 0 && plan?.jobId && (
                    <div>
                      <div className="text-sm text-gray-400 mb-3">Individual Patient Downloads (First 20)</div>
                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-auto">
                        {splitRes.patientIds.slice(0, 20).map((pid) => (
                          <a
                            key={pid}
                            href={`/api/download-patient?job=${encodeURIComponent(plan.jobId)}&patient=${encodeURIComponent(pid)}`}
                            className="inline-flex items-center gap-2 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-2 rounded-lg transition-colors font-mono"
                          >
                            <Download className="w-3 h-3" />
                            {pid}.zip
                          </a>
                        ))}
                      </div>
                      {splitRes.patientIds.length > 20 && (
                        <p className="text-xs text-gray-500 mt-3">
                          Showing first 20 — use "Download All Patient Folders" above for the complete set.
                        </p>
                      )}
                    </div>
                  )}

                  {splitRes.sample?.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-400 mb-3">Sample Patient Data</div>
                      <div className="space-y-2">
                        {splitRes.sample.map((s) => (
                          <div key={s.patient} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                            <div className="font-mono text-sm text-emerald-300 mb-1">{s.patient}</div>
                            <div className="text-xs text-gray-400">Files: {s.files.join(', ')}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

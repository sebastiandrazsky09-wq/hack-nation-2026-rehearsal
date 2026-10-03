'use client';
import { useState } from 'react';
import { ArrowUpRight, Check, FileText, LoaderCircle, Radio, ShieldCheck } from 'lucide-react';
import type { Run } from '../contracts/brief';
import { sampleInput } from '../server/fixtures';
export function Workspace({ mode }: { mode: 'live' | 'replay' }) {
  const [text, setText] = useState(sampleInput);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [access, setAccess] = useState('');
  async function analyze() {
    setBusy(true); setError(''); setRun(null);
    try {
      if (mode === 'live' && access) {
        const unlock = await fetch('/api/demo-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: access }) });
        if (!unlock.ok) throw new Error('Invalid demo access code');
        setAccess('');
      }
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Analysis failed');
      setRun(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <div className="shell">
    <header><a className="brand" href="/"><span className="brand-icon"><Radio size={18} /></span> SIGNAL DESK</a><span className={`mode ${mode}`}><span />{mode === 'live' ? 'Live analysis' : 'Sample replay · no live AI'}</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">THE EVIDENCE WORKSPACE</p><h1>From messy report<br />to a clear next move.</h1><p className="subtitle">Facts, gaps, and actions in one view.<br />Every conclusion stays connected to its source.</p></div><div className="intro-note"><ShieldCheck size={22} /><p>Evidence first.<br /><strong>No invented certainty.</strong></p></div></div>
      <div className="workspace-grid">
        <section className="input-panel"><div className="section-heading"><span className="step">01</span><h2>Source report</h2><FileText size={18} /></div><label htmlFor="report">Paste the report you need to understand</label><textarea id="report" value={text} onChange={e => setText(e.target.value)} maxLength={12000} /><div className="input-meta"><span>{text.length.toLocaleString()} / 12,000 characters</span><button className="text-button" onClick={() => { setText(sampleInput); setRun(null); setError(''); }}>Load sample</button></div>{mode === 'live' && <label>Private demo access code (once per browser)<input className="access-input" type="password" value={access} onChange={e => setAccess(e.target.value)} autoComplete="off" /></label>}<button className="analyze" disabled={busy || text.trim().length < 20} onClick={analyze}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />}{busy ? 'Checking the evidence…' : mode === 'live' ? 'Analyze report' : 'Open sample replay'}</button>{mode === 'replay' && <p className="replay-note">This is a fixed sample replay. New inputs require configured live API access.</p>}{error && <p className="error" role="alert">{error}</p>}</section>
        <section className="result-panel" aria-live="polite"><div className="section-heading"><span className="step">02</span><h2>Decision brief</h2>{run && <Check size={18} />}</div>{run ? <>
          <div className="result-title"><p className="eyebrow">{run.mode === 'live' ? 'LIVE RESULT' : 'PREPARED SAMPLE FIXTURE'}</p><h3>{run.brief.title}</h3><p>{run.brief.summary}</p></div>
          <div className="result-section"><h4>What the source says</h4>{run.brief.evidence.map((item, i) => <div className="evidence" key={i}><blockquote>“{item.quote}”</blockquote><p>{item.interpretation}</p></div>)}</div>
          <div className="result-section"><h4>Next actions</h4>{run.brief.actions.map((item, i) => <div className="action" key={i}><span className={`urgency ${item.urgency}`}>{item.urgency}</span><div><strong>{item.action}</strong><p>{item.reason}</p></div></div>)}</div>
          <div className="unknowns"><h4>Still unknown</h4><ul>{run.brief.unknowns.map(item => <li key={item}>{item}</li>)}</ul></div>
          <div className="trace"><span>{run.model}</span><span>{run.latencyMs} ms</span><span>{run.mode === 'replay' ? '$0 · replay' : run.estimatedCostUsd === null ? 'Cost unavailable' : `~$${run.estimatedCostUsd.toFixed(4)}`}</span></div>
        </> : <div className="empty"><div className="empty-icon"><FileText size={28} /></div><h3>Your next move starts here.</h3><p>Open the sample to inspect the complete flow.<br />Connect a provider to analyze a new report.</p><div className="empty-checks"><span><Check size={14} /> Source-linked evidence</span><span><Check size={14} /> Explicit unknowns</span><span><Check size={14} /> Prioritized actions</span></div></div>}</section>
      </div>
      <footer><span>PROTOTYPE / PREPARED STARTER</span><span>Human review required for consequential decisions.</span></footer>
    </main>
  </div>;
}

'use client';
import { Fragment, useEffect, useState } from 'react';
import { canonicalRequest, type CheckRequest, type CheckResponse, type Decision } from '../../gate/contract';
import { curlFor, safeHref } from '../gate-client';
import { DecisionMark } from '../decision-mark';
import { ORIGIN_LABELS, RESULT_LABELS, VERIFICATION_LABELS, factName, label, longDate, shortDate } from '../labels';
import { FlagMark, SignalMark } from '../signal';
import { TimeAxis } from '../timeline';
import { FACT_INPUT_LABELS, SupplyInput } from './supply';

const OUTCOMES: Record<CheckResponse['determining'][number]['outcome'], { word: string; mark: Decision }> = {
  violated: { word: 'Violated', mark: 'BLOCK' }, unresolved: { word: 'Unresolved', mark: 'REVIEW' },
  obligation: { word: 'Obligation', mark: 'REQUIRE' }, satisfied: { word: 'Satisfied', mark: 'PASS' }
};
const EFFECT_WORDS: Record<string, string> = { prohibit: 'Prohibits', limit: 'Limits', obligation: 'Requires', none: 'No constraint' };
const CHECK_WORDS: Record<string, string> = { jurisdiction: 'Jurisdiction', status: 'Status', coverage: 'Coverage', exemption: 'Exemption', precedence: 'Precedence', constraint: 'Constraint' };
const STEP_WORDS: Record<string, string> = { matched: 'Matched', not_matched: 'Not matched', unknown: 'Unknown' };

/** Copies `text` and says so for 1.5 seconds. */
export function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (key: string, text: string) => { navigator.clipboard.writeText(text).then(() => setCopied(key), () => setCopied(null)); };
  return { copied, copy };
}

export function DecisionBlock({ response, was, tint }: { response: CheckResponse; was: Decision | null; tint: boolean }) {
  const { copied, copy } = useCopied();
  return (
    <section className={`ck-decision ck-decision-${response.decision}${tint ? ' ck-tint' : ''}`} data-testid="decision" aria-live="polite" aria-label="Decision">
      <p className="ck-word-line"><DecisionMark decision={response.decision} size={26} /><span className="ck-word" data-testid="decision-word">{response.decision}</span></p>
      <p className="ck-summary-text">{response.summary}</p>
      {was && <p className="ck-was" data-testid="was">Was {was}.</p>}
      <p className="ck-meta">
        <button type="button" className="ck-copy ck-mono" data-testid="decision-id" onClick={() => copy('id', response.decision_id)} aria-label={`Copy decision id ${response.decision_id}`}>{response.decision_id}</button>
        <span aria-hidden> · </span>
        <button type="button" className="ck-copy ck-mono" onClick={() => copy('version', response.ruleset_version)} aria-label={`Copy ruleset version ${response.ruleset_version}`}>{response.ruleset_version}</button>
        <span> · as of {longDate(response.as_of)} · {response.evaluated_ms.toFixed(1)} ms</span>
        <span role="status" className="ck-copied">{copied ? 'Copied' : ''}</span>
      </p>
    </section>
  );
}

const REASON_WORDS: Record<string, string> = {
  missing_fact: 'A needed fact is missing', cutoff_ambiguous: 'A cutoff date cannot be settled from the year built',
  unverifiable_condition: 'A condition of the rule cannot be tested from the data', conditional_prohibition: 'The ban depends on elements the gate cannot observe',
  limit_not_computable: 'The limit cannot be computed from the data', constraint_not_modeled: 'The rule applies and has no verified constraint for this action',
  conflict: 'A possible conflict with another rule is flagged', coverage_gap: 'Known gap in the sources'
};
const RANK: Record<CheckResponse['determining'][number]['outcome'], number> = { violated: 0, unresolved: 1, obligation: 2, satisfied: 3 };
type Row = CheckResponse['determining'][number];

/** One row per rule that fixed the outcome, with the quoted sentence that proves it. The full evidence is further down. */
export function Determining({ rows, evidence, review }: { rows: CheckResponse['determining']; evidence: CheckResponse['evidence']; review: CheckResponse['review'] }) {
  if (rows.length === 0) return null;
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.rule_id, [...(groups.get(r.rule_id) ?? []), r]);
  return (
    <section className="ck-section" data-testid="determining" aria-labelledby="ck-h-determining">
      <h2 id="ck-h-determining">Determining rules</h2>
      <table className="ck-table">
        <thead><tr><th>Outcome</th><th>Rule</th><th>Jurisdiction</th><th>Citation</th><th>Effect</th></tr></thead>
        <tbody>
          {[...groups].map(([id, own]) => {
            const top = [...own].sort((a, b) => RANK[a.outcome] - RANK[b.outcome])[0];
            const duties = own.filter(r => r.outcome === 'obligation').length;
            // A figure needs its sentence ("2 months exceeds the limit of 1.5"); a plain ban is already said by the Effect column and the quote.
            const measured = own.filter(r => (r.outcome === 'violated' || r.outcome === 'satisfied') && r.effect === 'limit');
            const reasons = top.outcome === 'unresolved' ? [...new Map(review.filter(v => v.rule_id === id).map(v => [v.code, v])).values()] : [];
            const effects = [...new Set(own.map(r => r.effect).filter((e): e is NonNullable<Row['effect']> => e !== null))];
            const proof = evidence.find(e => e.rule_id === id && e.kind === 'constraint') ?? evidence.find(e => e.rule_id === id);
            const href = proof ? safeHref(proof.source_url) : null;
            const note = own.find(r => r.conflict_note)?.conflict_note;
            return (
              <Fragment key={id}>
                <tr className={proof || note ? 'ck-has-proof' : undefined}>
                  <td data-label="Outcome"><span className="ck-outcome"><DecisionMark decision={OUTCOMES[top.outcome].mark} size={14} />{OUTCOMES[top.outcome].word}</span></td>
                  <td data-label="Rule">
                    <span className="ck-rule-title">{top.title}</span>
                    {measured.map((r, i) => <span key={i} className="ck-detail">{r.detail}</span>)}
                    {reasons.map(v => <span key={v.code} className="ck-detail">{REASON_WORDS[v.code] ?? v.code}{v.code === 'missing_fact' && v.missing_facts.length ? `: ${v.missing_facts.map(factName).join(', ')}` : ''}.</span>)}
                    {duties > 0 && <span className="ck-detail">{duties === 1 ? 'One duty attaches' : `${duties} duties attach`}, listed under Before proceeding.</span>}
                  </td>
                  <td data-label="Jurisdiction">{top.jurisdiction}</td>
                  <td data-label="Citation">{top.citation}</td>
                  <td data-label="Effect">{effects.length ? effects.map(e => EFFECT_WORDS[e] ?? e).join(', ') : '—'}</td>
                </tr>
                {(proof || note) && (
                  <tr className="ck-proof-row">
                    <td aria-hidden className="ck-proof-pad" />
                    <td colSpan={4}>
                      {proof && (
                        <span className="ck-proof">
                          <q>{proof.quoted_span}</q>
                          <span className="ck-proof-source">{href ? <a href={href} target="_blank" rel="noreferrer noopener">{proof.source_doc_id}</a> : proof.source_doc_id}, {label(VERIFICATION_LABELS, proof.verification_method)}</span>
                        </span>
                      )}
                      {note && <span className="ck-conflict"><FlagMark size={14} />{note}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function Obligations({ items }: { items: CheckResponse['obligations'] }) {
  if (items.length === 0) return null;
  return (
    <section className="ck-section" data-testid="obligations" aria-labelledby="ck-h-obligations">
      <h2 id="ck-h-obligations"><DecisionMark decision="REQUIRE" size={14} />Before proceeding</h2>
      <ul className="ck-list">
        {items.map((o, i) => <li key={`${o.rule_id}-${i}`}>{o.text}<span className="ck-cite">{o.citation}</span></li>)}
      </ul>
    </section>
  );
}

export function Unresolved({ items, titles, issueFor, onSupply }: {
  items: CheckResponse['review']; titles: Map<string, string>; issueFor: (fact: string) => string | undefined; onSupply: (fact: string, value: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="ck-section" data-testid="review" aria-labelledby="ck-h-review">
      <h2 id="ck-h-review"><DecisionMark decision="REVIEW" size={14} />Cannot resolve</h2>
      <ul className="ck-review">
        {items.map((item, i) => {
          const unsuppliable = item.missing_facts.filter(f => !(item.resolvable_by as string[]).includes(f));
          return (
            <li key={`${item.code}-${item.rule_id ?? 'none'}-${i}`} data-code={item.code} className={i > 0 && items[i - 1].rule_id === item.rule_id ? 'ck-same-rule' : undefined}>
              {(i === 0 || items[i - 1].rule_id !== item.rule_id) && <p className="ck-review-rule">{item.rule_id ? titles.get(item.rule_id) ?? item.rule_id : 'Sources'}</p>}
              {item.code === 'missing_fact' && item.missing_facts.length > 0 && <p className="ck-missing">Missing: {item.missing_facts.map(factName).join(', ')}</p>}
              <p className="ck-detail-text">{item.detail}</p>
              {item.code === 'coverage_gap' && <p className="ck-detail">No fact you can supply resolves this gap.</p>}
              {item.resolvable_by.map(fact => (
                <SupplyInput key={fact} fact={fact} label={FACT_INPUT_LABELS[fact] ?? factName(fact)} error={issueFor(fact)} onSupply={onSupply} />
              ))}
              {item.code === 'missing_fact' && unsuppliable.length > 0 && <p className="ck-detail">Not something you can supply here: {unsuppliable.map(factName).join(', ')}.</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TimeSection({ response, asOf, onDate }: { response: CheckResponse; asOf: string; onDate: (date: string) => void }) {
  const points = response.change_points;
  return (
    <section className="ck-section" data-testid="time" aria-labelledby="ck-h-time">
      <h2 id="ck-h-time">Time</h2>
      <div className="ck-axis"><TimeAxis asOf={asOf} caseDates={points.map(p => p.date)} onChange={onDate} /></div>
      {points.length > 0 && (
        <div className="ck-points" role="group" aria-label="Dates when the law changes">
          {points.map(p => (
            <button key={`${p.date}-${p.label}`} type="button" className="ck-point" aria-pressed={asOf === p.date} onClick={() => onDate(p.date)}
              aria-label={p.label.startsWith(`${shortDate(p.date)}:`) ? p.label : `${shortDate(p.date)}: ${p.label}`}>
              <span className="ck-point-date">{shortDate(p.date)}</span><span className="sep-hidden">: </span>
              <span>{p.label.startsWith(`${shortDate(p.date)}: `) ? p.label.slice(shortDate(p.date).length + 2) : p.label}</span>
            </button>
          ))}
        </div>
      )}
      {response.upcoming.length > 0 && (
        <ul className="ck-upcoming">
          {response.upcoming.map((u, i) => (
            <li key={`${u.rule_id}-${i}`}>
              <span className="ck-rule-title">{u.title}</span>
              <span className="ck-detail">
                {u.status === 'pending' ? 'pending, not enacted' : u.effective_date ? `takes effect ${shortDate(u.effective_date)}` : 'enacted, not yet in effect'}
                {u.would_be && <span className="ck-would"> · would be <DecisionMark decision={u.would_be} size={13} /> {u.would_be}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TraceRule({ rule }: { rule: CheckResponse['trace'][number] }) {
  return (
    <details className="ck-trace-rule">
      <summary><SignalMark result={rule.result} size={14} /><span className="ck-rule-title">{rule.title}</span><span className="ck-trace-result">{label(RESULT_LABELS, rule.result)}</span></summary>
      <div className="ck-steps">
        {rule.steps.map((s, i) => (
          <div key={i} className="ck-step"><span>{CHECK_WORDS[s.check] ?? s.check}</span><span>{STEP_WORDS[s.outcome] ?? s.outcome}</span><span>{s.detail}</span></div>
        ))}
      </div>
    </details>
  );
}

export function Trace({ trace }: { trace: CheckResponse['trace'] }) {
  if (trace.length === 0) return null;
  const inside = trace.filter(r => r.result !== 'not_applicable');
  const outside = trace.filter(r => r.result === 'not_applicable');
  return (
    <section className="ck-section" data-testid="trace" aria-labelledby="ck-h-trace">
      <h2 id="ck-h-trace">Trace</h2>
      {inside.map(r => <TraceRule key={r.rule_id} rule={r} />)}
      {outside.length > 0 && (
        <details className="ck-outside">
          <summary>Rules outside this property ({outside.length})</summary>
          {outside.map(r => <TraceRule key={r.rule_id} rule={r} />)}
        </details>
      )}
    </section>
  );
}

export function Evidence({ evidence }: { evidence: CheckResponse['evidence'] }) {
  if (evidence.length === 0) return null;
  return (
    <section className="ck-section" data-testid="evidence" aria-labelledby="ck-h-evidence">
      <h2 id="ck-h-evidence">Evidence</h2>
      <ul className="ck-evidence">
        {evidence.map((e, i) => {
          const href = safeHref(e.source_url);
          return (
            <li key={`${e.rule_id}-${e.kind}-${i}`}>
              <blockquote className="quote ck-quote">{e.quoted_span}</blockquote>
              <p className="ck-source">
                <span>{e.citation}</span>
                <span>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{e.source_url}</a> : e.source_url}</span>
                <span>{e.source_doc_id}</span>
                <span>{label(ORIGIN_LABELS, e.source_origin)}</span>
                {e.retrieved_at && <span>retrieved {e.retrieved_at.slice(0, 10)}</span>}
                <span>{label(VERIFICATION_LABELS, e.verification_method)}</span>
                <span>{e.kind === 'rule' ? 'the rule’s sentence' : 'the constraint’s sentence'}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Coverage({ response }: { response: CheckResponse }) {
  const c = response.coverage;
  return (
    <section className="ck-section" data-testid="coverage" aria-labelledby="ck-h-coverage">
      <h2 id="ck-h-coverage">Coverage</h2>
      <p>Checked {c.rules_considered} rules for {c.jurisdictions.join(', ')}. {c.sources_unreadable} of {c.sources_read + c.sources_unreadable} listed sources could not be read.</p>
      {c.known_gaps.map((g, i) => <p key={i} className="ck-gap"><DecisionMark decision="REVIEW" size={14} />{g}</p>)}
      <p className="ck-detail">{response.subject_note}</p>
    </section>
  );
}

export function Payload({ request, response }: { request: CheckRequest; response: CheckResponse }) {
  const [tab, setTab] = useState<'curl' | 'json'>('curl');
  const [origin, setOrigin] = useState('');
  const { copied, copy } = useCopied();
  useEffect(() => setOrigin(window.location.origin), []);
  const sent = canonicalRequest(request, response.as_of);
  const requestText = JSON.stringify(sent, null, 2);
  const responseText = JSON.stringify(response, null, 2);
  const curl = curlFor(origin, '/api/v1/check', sent);
  return (
    <section className="ck-section" data-testid="payload">
      <details className="ck-payload">
        <summary>Request and response</summary>
        <div className="ck-tabs" role="tablist" aria-label="Format">
          <button type="button" role="tab" id="ck-tab-curl" aria-selected={tab === 'curl'} aria-controls="ck-panel-curl" onClick={() => setTab('curl')}>curl</button>
          <button type="button" role="tab" id="ck-tab-json" aria-selected={tab === 'json'} aria-controls="ck-panel-json" onClick={() => setTab('json')}>JSON</button>
          <button type="button" className="ck-button ck-tabs-copy" onClick={() => copy(tab, tab === 'curl' ? curl : `${requestText}\n\n${responseText}`)}>Copy</button>
          <span role="status" className="ck-copied">{copied ? 'Copied' : ''}</span>
        </div>
        <div className="ck-frame" role="tabpanel" id="ck-panel-curl" aria-labelledby="ck-tab-curl" hidden={tab !== 'curl'} tabIndex={0}>
          <pre data-testid="payload-curl">{curl}</pre>
        </div>
        <div className="ck-frame" role="tabpanel" id="ck-panel-json" aria-labelledby="ck-tab-json" hidden={tab !== 'json'} tabIndex={0}>
          <pre data-testid="payload-request">{requestText}</pre>
          <pre data-testid="payload-response">{responseText}</pre>
        </div>
      </details>
      <p className="ck-detail">Rental housing is the first policy domain. The request and response shapes are domain-neutral.</p>
    </section>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { canonicalRequest, type CheckRequest, type CheckResponse, type Decision, type EnvelopeInterval, type EnvelopeRequest, type EnvelopeResponse } from '../../gate/contract';
import { curlFor, safeHref } from '../gate-client';
import { DecisionMark } from '../decision-mark';
import { ORIGIN_LABELS, RESULT_LABELS, VERIFICATION_LABELS, factName, label, longDate, shortDate } from '../labels';
import { FlagMark, SignalMark } from '../signal';
import { TimeAxis } from '../timeline';
import { FACT_INPUT_LABELS, SupplyInput } from './supply';

type Row = CheckResponse['determining'][number];
type EvidenceItem = CheckResponse['evidence'][number];
const OUTCOMES: Record<Row['outcome'], { word: string; mark: Decision }> = {
  violated: { word: 'Violated', mark: 'BLOCK' }, unresolved: { word: 'Unresolved', mark: 'REVIEW' },
  obligation: { word: 'Duties attach', mark: 'REQUIRE' }, satisfied: { word: 'Satisfied', mark: 'PASS' }
};
const RANK: Record<Row['outcome'], number> = { violated: 0, unresolved: 1, obligation: 2, satisfied: 3 };
const EFFECT_WORDS: Record<string, string> = { prohibit: 'prohibits', limit: 'limits', obligation: 'requires', none: 'no constraint' };
const CHECK_WORDS: Record<string, string> = { jurisdiction: 'Jurisdiction', status: 'Status', coverage: 'Coverage', exemption: 'Exemption', precedence: 'Precedence', constraint: 'Constraint' };
const STEP_WORDS: Record<string, string> = { matched: 'matched', not_matched: 'not matched', unknown: 'unknown' };
const REASON_WORDS: Record<string, string> = {
  missing_fact: 'A needed fact is missing', cutoff_ambiguous: 'A cutoff date cannot be settled from the year built',
  unverifiable_condition: 'A condition of the rule cannot be tested from the data', conditional_prohibition: 'The ban depends on elements the engine cannot observe',
  limit_not_computable: 'The limit cannot be computed from the data', constraint_not_modeled: 'The rule applies and has no verified constraint for this action',
  conflict: 'A possible conflict with another rule is flagged', coverage_gap: 'Known gap in the sources'
};

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

/** The decision: one word, large enough to read across a room, then one sentence. */
export function DecisionBlock({ response, was, tint }: { response: CheckResponse; was: Decision | null; tint: boolean }) {
  const { copied, copy } = useCopied();
  return (
    <div className={`ck-decision ck-decision-${response.decision}${tint ? ' ck-tint' : ''}`} data-testid="decision" aria-live="polite" role="group" aria-label="Decision">
      <p className="ck-word-line"><span className="ck-glyph"><DecisionMark decision={response.decision} size={64} /></span><span className="ck-word" data-testid="decision-word">{response.decision}</span></p>
      <p className="ck-summary-text">{response.summary}</p>
      <p className="ck-meta">
        {was && <span className="ck-was" data-testid="was">Was {was}.</span>}
        <button type="button" className="ck-copy" data-testid="decision-id" onClick={() => copy('id', response.decision_id)} aria-label={`Copy decision id ${response.decision_id}`}>{response.decision_id}</button>
        <button type="button" className="ck-copy" onClick={() => copy('version', response.ruleset_version)} aria-label={`Copy ruleset version ${response.ruleset_version}`}>ruleset {response.ruleset_version}</button>
        <span>as of {longDate(response.as_of)}</span>
        <span>{response.evaluated_ms.toFixed(1)} ms</span>
        <span role="status" className="ck-copied">{copied ? 'Copied' : ''}</span>
      </p>
    </div>
  );
}

/** Why: one entry per rule that fixed the outcome. */
export function Determining({ rows, review }: { rows: CheckResponse['determining']; review: CheckResponse['review'] }) {
  if (rows.length === 0) return null;
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.rule_id, [...(groups.get(r.rule_id) ?? []), r]);
  return (
    <ul className="ck-why" data-testid="determining">
      {[...groups].map(([id, own]) => {
        const top = [...own].sort((a, b) => RANK[a.outcome] - RANK[b.outcome])[0];
        // A figure needs its sentence ("2 months exceeds the limit of 1.5"); a plain ban is said by the outcome and proven by the quote.
        const measured = own.filter(r => (r.outcome === 'violated' || r.outcome === 'satisfied') && r.effect === 'limit');
        const reasons = top.outcome === 'unresolved' ? [...new Map(review.filter(v => v.rule_id === id).map(v => [v.code, v])).values()] : [];
        const effects = [...new Set(own.map(r => r.effect).filter((e): e is NonNullable<Row['effect']> => e !== null))];
        const note = own.find(r => r.conflict_note)?.conflict_note;
        return (
          <li key={id} data-rule={id}>
            <p className={`ck-outcome ck-outcome-${OUTCOMES[top.outcome].mark}`}><DecisionMark decision={OUTCOMES[top.outcome].mark} size={13} />{OUTCOMES[top.outcome].word}</p>
            <p className="ck-rule-title">{top.title}</p>
            <p className="ck-rule-meta"><span>{top.jurisdiction}</span>{top.citation !== top.title && <span className="ck-cite">{top.citation}</span>}{effects.length > 0 && <span>{effects.map(e => EFFECT_WORDS[e] ?? e).join(', ')}</span>}</p>
            {measured.map((r, i) => <p key={i} className="ck-rule-detail">{r.detail}</p>)}
            {reasons.map(v => <p key={v.code} className="ck-rule-detail">{REASON_WORDS[v.code] ?? v.code}{v.code === 'missing_fact' && v.missing_facts.length ? `: ${v.missing_facts.map(factName).join(', ')}` : ''}.</p>)}
            {note && <p className="ck-conflict"><FlagMark size={14} />{note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function Obligations({ items }: { items: CheckResponse['obligations'] }) {
  if (items.length === 0) return null;
  return (
    <div className="ck-block" data-testid="obligations">
      <h3 className="ck-sub">Before proceeding</h3>
      <ol className="ck-duties">
        {items.map((o, i) => <li key={`${o.rule_id}-${i}`}><span>{o.text}</span><span className="ck-cite">{o.citation}</span></li>)}
      </ol>
    </div>
  );
}

/** What cannot be settled. A point the caller can settle carries the field that settles it. */
export function Unresolved({ items, titles, issueFor, onSupply }: {
  items: CheckResponse['review']; titles: Map<string, string>; issueFor: (fact: string) => string | undefined; onSupply: (fact: string, value: number) => void;
}) {
  if (items.length === 0) return null;
  // Each fact the caller can supply is asked for once, first, with its field; the explanations follow.
  const askable = [...new Set(items.flatMap(item => item.resolvable_by as string[]))];
  return (
    <div data-testid="review" className="ck-review-wrap">
      {askable.length > 0 && (
        <div className="ck-resolve">
          {askable.map(fact => <SupplyInput key={fact} fact={fact} label={FACT_INPUT_LABELS[fact] ?? factName(fact)} error={issueFor(fact)} onSupply={onSupply} />)}
        </div>
      )}
      <ul className="ck-review">
      {items.map((item, i) => {
        const unsuppliable = item.missing_facts.filter(f => !(item.resolvable_by as string[]).includes(f));
        const first = i === 0 || items[i - 1].rule_id !== item.rule_id;
        return (
          <li key={`${item.code}-${item.rule_id ?? 'none'}-${i}`} data-code={item.code} className={first ? undefined : 'ck-same-rule'}>
            {first && <p className="ck-review-rule">{item.rule_id ? titles.get(item.rule_id) ?? item.rule_id : 'Sources'}</p>}
            {item.code === 'missing_fact' && item.missing_facts.length > 0 && <p className="ck-missing">Missing: {item.missing_facts.map(factName).join(', ')}</p>}
            <p className="ck-detail-text">{item.detail}</p>
            {item.code === 'coverage_gap' && <p className="ck-fine">No fact you can supply resolves this gap.</p>}
            {item.code === 'missing_fact' && unsuppliable.length > 0 && <p className="ck-fine">Not something you can supply here: {unsuppliable.map(factName).join(', ')}.</p>}
          </li>
        );
      })}
      </ul>
    </div>
  );
}

function SourceLine({ e }: { e: EvidenceItem }) {
  const href = safeHref(e.source_url);
  return (
    <p className="ck-source">
      <span>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{e.source_doc_id}</a> : e.source_doc_id}</span>
      <span>{label(ORIGIN_LABELS, e.source_origin)}</span>
      {e.retrieved_at && <span>retrieved {e.retrieved_at.slice(0, 10)}</span>}
      <span>{label(VERIFICATION_LABELS, e.verification_method)}</span>
    </p>
  );
}

/** Evidence: for each determining rule the sentence that proves it, then everything else behind a disclosure. */
export function Evidence({ evidence, determining }: { evidence: CheckResponse['evidence']; determining: CheckResponse['determining'] }) {
  if (evidence.length === 0) return null;
  const ruleIds = [...new Set(determining.map(d => d.rule_id))];
  const primary = ruleIds.map(id => evidence.find(e => e.rule_id === id && e.kind === 'constraint') ?? evidence.find(e => e.rule_id === id)).filter((e): e is EvidenceItem => e !== undefined);
  const lead = primary.length ? primary : evidence.slice(0, 1);
  const rest = evidence.filter(e => !lead.includes(e));
  return (
    <div data-testid="evidence">
      <ul className="ck-evidence">
        {lead.map((e, i) => <li key={`${e.rule_id}-${e.kind}-${i}`}><blockquote className="ck-quote">{e.quoted_span}</blockquote><SourceLine e={e} /></li>)}
      </ul>
      {rest.length > 0 && (
        <details className="ck-more-evidence">
          <summary>{rest.length === 1 ? 'One more quoted sentence' : `${rest.length} more quoted sentences`}</summary>
          <ul className="ck-evidence ck-evidence-rest">
            {rest.map((e, i) => <li key={`${e.rule_id}-${e.kind}-${i}`}><blockquote className="ck-quote">{e.quoted_span}</blockquote><SourceLine e={e} /></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TimeSection({ response, asOf, onDate }: { response: CheckResponse; asOf: string; onDate: (date: string) => void }) {
  const points = response.change_points;
  return (
    <div data-testid="time">
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
              <span className="ck-upcoming-title">{u.title}</span>
              <span className="ck-fine">
                {u.status === 'pending' ? 'pending, not enacted' : u.effective_date ? `takes effect ${shortDate(u.effective_date)}` : 'enacted, not yet in effect'}
                {u.would_be && <span className="ck-would">, would be <DecisionMark decision={u.would_be} size={12} /> {u.would_be}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TraceRule({ rule }: { rule: CheckResponse['trace'][number] }) {
  return (
    <details className="ck-trace-rule">
      <summary><SignalMark result={rule.result} size={14} /><span className="ck-trace-title">{rule.title}</span><span className="ck-trace-result">{label(RESULT_LABELS, rule.result)}</span></summary>
      <div className="ck-steps">
        {rule.steps.map((s, i) => (
          <div key={i} className="ck-step-row"><span>{CHECK_WORDS[s.check] ?? s.check}</span><span>{STEP_WORDS[s.outcome] ?? s.outcome}</span><span>{s.detail}</span></div>
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
    <div data-testid="trace" className="ck-trace">
      {inside.map(r => <TraceRule key={r.rule_id} rule={r} />)}
      {outside.length > 0 && (
        <details className="ck-outside">
          <summary>Rules outside this property ({outside.length})</summary>
          {outside.map(r => <TraceRule key={r.rule_id} rule={r} />)}
        </details>
      )}
    </div>
  );
}

export function Coverage({ response }: { response: CheckResponse }) {
  const c = response.coverage;
  return (
    <div data-testid="coverage" className="ck-coverage">
      <p>Checked {c.rules_considered} rules for {c.jurisdictions.join(', ')}. {c.sources_unreadable} of {c.sources_read + c.sources_unreadable} listed sources could not be read.</p>
      {c.known_gaps.map((g, i) => <p key={i} className="ck-gap"><DecisionMark decision="REVIEW" size={14} />{g}</p>)}
      <p className="ck-fine">{response.subject_note}</p>
    </div>
  );
}

// Colours a JSON text without changing a character of it: keys dim, the decision in its own colour.
function Json({ text }: { text: string }) {
  const parts = text.split(/("(?:[^"\\]|\\.)*")(\s*:)?/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(parts[i]);
    const str = parts[i + 1]; const colon = parts[i + 2];
    if (str === undefined) continue;
    if (colon) out.push(<span key={i} className="ck-k">{str}</span>, colon);
    else out.push(<span key={i} className={/^"(PASS|BLOCK|REQUIRE|REVIEW)"$/.test(str) ? `ck-v ck-v-${str.slice(1, -1)}` : 'ck-v'}>{str}</span>);
  }
  return <>{out}</>;
}

/** The call behind the screen: the exact request sent and the exact response received. */
export function Payload({ request, response, envelopeRequest, envelope, open }: {
  request: CheckRequest; response: CheckResponse; envelopeRequest: EnvelopeRequest; envelope: EnvelopeResponse; open: boolean;
}) {
  const [chosen, setTab] = useState<'request' | 'response' | 'curl' | 'envelope'>('request');
  // With the amount left open the panel shows the envelope call itself, so its own tab is not needed.
  const tab = open && chosen === 'envelope' ? 'curl' : chosen;
  const path = open ? '/api/v1/envelope' : '/api/v1/check';
  const [origin, setOrigin] = useState('');
  const { copied, copy } = useCopied();
  useEffect(() => setOrigin(window.location.origin), []);
  const sent = open ? envelopeRequest : canonicalRequest(request, response.as_of);
  const requestText = JSON.stringify(sent, null, 2);
  const responseText = JSON.stringify(open ? envelope : response, null, 2);
  const curl = curlFor(origin, path, sent);
  const envelopeCurl = curlFor(origin, '/api/v1/envelope', envelopeRequest);
  const text = tab === 'request' ? requestText : tab === 'response' ? responseText : tab === 'envelope' ? envelopeCurl : curl;
  const tabs = open ? (['request', 'response', 'curl'] as const) : (['request', 'response', 'curl', 'envelope'] as const);
  return (
    <div className="ck-code" data-testid="payload">
      <div className="ck-code-head">
        <p className="ck-code-title"><span>POST</span> {path}</p>
        <div className="ck-tabs" role="tablist" aria-label="Request and response">
          {tabs.map(t => (
            <button key={t} type="button" role="tab" id={`ck-tab-${t}`} aria-selected={tab === t} aria-controls={`ck-panel-${t}`} onClick={() => setTab(t)}>{t === 'curl' ? 'curl' : t === 'request' ? 'Request' : t === 'response' ? 'Response' : 'Envelope'}</button>
          ))}
          <button type="button" className="ck-code-copy" onClick={() => copy(tab, text)}>{copied ? 'Copied' : 'Copy'}</button>
          <span role="status" className="sep-hidden">{copied ? 'Copied' : ''}</span>
        </div>
      </div>
      <div className="ck-frame" role="tabpanel" id="ck-panel-request" aria-labelledby="ck-tab-request" hidden={tab !== 'request'} tabIndex={0}><pre data-testid="payload-request"><Json text={requestText} /></pre></div>
      <div className="ck-frame" role="tabpanel" id="ck-panel-response" aria-labelledby="ck-tab-response" hidden={tab !== 'response'} tabIndex={0}><pre data-testid="payload-response"><Json text={responseText} /></pre></div>
      <div className="ck-frame" role="tabpanel" id="ck-panel-curl" aria-labelledby="ck-tab-curl" hidden={tab !== 'curl'} tabIndex={0}><pre data-testid="payload-curl">{curl}</pre></div>
      {!open && <div className="ck-frame" role="tabpanel" id="ck-panel-envelope" aria-labelledby="ck-tab-envelope" hidden={tab !== 'envelope'} tabIndex={0}><pre data-testid="payload-envelope">{envelopeCurl}</pre></div>}
      {open
        ? <p className="ck-code-foot"><span>200</span><span>{envelope.envelope_id}</span><span>{envelope.evaluated_ms.toFixed(1)} ms</span></p>
        : <p className="ck-code-foot"><span className={`ck-v-${response.decision}`}>200 {response.decision}</span><span>{response.decision_id}</span><span>{response.evaluated_ms.toFixed(1)} ms</span></p>}
    </div>
  );
}

// ---- Envelope: the same decision, over what the request leaves open. Every word below is computed from the response. ----
type EnvelopeOutcome = { decision: Decision | null; intervals: EnvelopeInterval[] | null };
const FACT_PHRASE: Record<string, string> = { units: 'the number of units', year_built: 'the year built' };
const amountText = (value: number, unit: string) => (unit === 'US dollars' ? `$${value}` : `${value} ${value === 1 ? 'month' : 'months'}`);
function rangeText(interval: EnvelopeInterval, all: EnvelopeInterval[], unit: string) {
  const first = interval === all[0]; const last = interval === all[all.length - 1];
  if (first && last) return 'any amount';
  if (first) return `up to ${amountText(interval.to, unit)}`;
  if (last) return `above ${amountText(interval.from, unit)}`;
  return `above ${amountText(interval.from, unit)}, up to ${amountText(interval.to, unit)}`;
}
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A decision, or one decision per part of the amount's range. */
function Outcome({ outcome, unit }: { outcome: EnvelopeOutcome; unit: string }) {
  if (!outcome.intervals) {
    return outcome.decision ? <span className={`ck-outcome ck-outcome-${outcome.decision}`}><DecisionMark decision={outcome.decision} size={13} />{outcome.decision}</span> : null;
  }
  const all = outcome.intervals;
  return (
    <span className="ck-env-parts">
      {all.map((i, n) => <span key={n} className={`ck-outcome ck-outcome-${i.decision}`}><DecisionMark decision={i.decision} size={13} />{i.decision} {rangeText(i, all, unit)}</span>)}
    </span>
  );
}

/** The amount's range as a line: one segment per interval, each bound written under the point where it falls. */
function AmountBar({ intervals, unit }: { intervals: EnvelopeInterval[]; unit: string }) {
  if (intervals.length < 2) return null;
  const scale = intervals[intervals.length - 2].to * 2;
  return (
    <div className="ck-env-bar" aria-hidden>
      {intervals.map((i, n) => {
        const last = n === intervals.length - 1;
        return <span key={n} className={`ck-env-seg ck-env-seg-${i.decision}`} style={{ flexGrow: Math.max((last ? scale : i.to) - i.from, scale * 0.12) }}>{last ? ' ' : amountText(i.to, unit)}</span>;
      })}
    </div>
  );
}

export function EnvelopeSection({ env, stale, asOf, ask, issueFor, onSupply, onDate }: {
  env: EnvelopeResponse; stale: boolean; asOf: string; ask: boolean;
  issueFor: (fact: string) => string | undefined; onSupply: (fact: string, value: number) => void; onDate: (date: string) => void;
}) {
  const p = env.permitted;
  const unit = p?.unit ?? '';
  const allowed = p ? p.intervals.filter(i => i.permit) : [];
  const waiting = env.decides.map(d => FACT_PHRASE[d.fact] ?? factName(d.fact));
  const lead = !p ? null
    : allowed.length ? `${allowed.map(i => sentence(rangeText(i, p.intervals, unit))).join('; ')}${unit === 'months of rent' && allowed[0].to !== p.intervals[p.intervals.length - 1].to ? ' of rent' : ''}`
    : p.reason === 'prohibited' ? 'No amount is permitted'
    : waiting.length ? `Not computable until ${waiting.join(' and ')} ${waiting.length === 1 ? 'is' : 'are'} known`
    : 'No amount can be confirmed as permitted';
  const bound = allowed.find(i => i.bounding_citation) ?? p?.intervals.find(i => i.bounding_citation) ?? null;
  const regionText = (fact: string, from: number | null, to: number | null) => {
    if (fact === 'units') return to === null ? `${from} or more units` : from === to ? `${from} ${from === 1 ? 'unit' : 'units'}` : `${from} to ${to} units`;
    return from === null ? `Built ${to} or earlier` : to === null ? `Built ${from} or later` : from === to ? `Built ${from}` : `Built ${from} to ${to}`;
  };
  const spanText = (from: string | null, to: string | null) => (from === null && to === null ? 'At every date' : from === null ? `Until ${shortDate(to!)}` : to === null ? `From ${shortDate(from)}` : `${shortDate(from)} to ${shortDate(to)}`);
  return (
    <div className="ck-env" data-testid="envelope" aria-busy={stale}>
      {p && (
        <div className="ck-env-row" data-row="permitted">
          <h3 className="ck-sub">Permitted</h3>
          <div>
            <p className="ck-env-lead" data-testid="envelope-permitted">{lead}</p>
            {bound && <p className="ck-env-bound"><span className="ck-cite">{bound.bounding_citation}</span>{bound.bound_text && <span>&ldquo;{bound.bound_text}&rdquo;</span>}</p>}
            <AmountBar intervals={p.intervals} unit={unit} />
            <p className="ck-env-line"><Outcome outcome={{ decision: null, intervals: p.intervals }} unit={unit} /></p>
            {env.obligations.length > 0 && <p className="ck-fine">{env.obligations.length === 1 ? 'One duty attaches' : `${env.obligations.length} duties attach`} inside the permitted range.</p>}
          </div>
        </div>
      )}
      {env.decides.map(axis => (
        <div key={axis.fact} className="ck-env-row" data-row="decides" data-fact={axis.fact}>
          <h3 className="ck-sub">Decides</h3>
          <div>
            <p className="ck-env-lead">{sentence(FACT_PHRASE[axis.fact] ?? factName(axis.fact))}, which the record does not hold</p>
            <ul className="ck-env-list">
              {axis.regions.map((r, n) => <li key={n} className="ck-env-item"><span className="ck-env-when">{regionText(axis.fact, r.from, r.to)}</span><span><Outcome outcome={r} unit={unit} /></span></li>)}
            </ul>
            {ask && <SupplyInput fact={axis.fact} label={FACT_INPUT_LABELS[axis.fact] ?? factName(axis.fact)} error={issueFor(axis.fact)} onSupply={onSupply} />}
          </div>
        </div>
      ))}
      <div className="ck-env-row" data-row="until">
        <h3 className="ck-sub">Until</h3>
        <ul className="ck-env-list">
          {env.timeline.map((s, n) => {
            const target = s.from ?? s.to;
            const body = (
              <>
                <span className="ck-env-when">{spanText(s.from, s.to)}{s.current && env.timeline.length > 1 ? ', now' : ''}</span>
                <span><Outcome outcome={s} unit={unit} />{s.cause_label && <span className="ck-env-cause">{sentence(s.cause_label)}</span>}</span>
              </>
            );
            return (
              <li key={n}>
                {target
                  ? <button type="button" className="ck-env-item ck-env-date" data-current={s.current} aria-pressed={asOf === target} aria-label={`Envelope, ${spanText(s.from, s.to)}: go to ${shortDate(target)}`} onClick={() => onDate(target)}>{body}</button>
                  : <div className="ck-env-item" data-current={s.current}>{body}</div>}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="ck-fine ck-env-foot"><span className="ck-cite">{env.envelope_id}</span> {env.evaluations} evaluations of the decision function in {env.evaluated_ms.toFixed(1)} ms. Enumerated over the thresholds in the compiled rules. Permitted means no modeled constraint is violated; it does not mean legal.</p>
    </div>
  );
}

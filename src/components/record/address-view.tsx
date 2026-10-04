'use client';
import { Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LookupResponse } from '../../server/ordinal';
import { CATEGORY_LABELS, CATEGORY_ORDER, METHOD_LABELS, RESULT_LABELS, RESULT_MEANINGS, RESULT_ORDER, confidenceWords, label, longDate, streetCase } from '../labels';
import { RuleRow } from '../rule-card';
import { SignalMark } from '../signal';
import { TimeAxis, floorDate, needleStyle } from '../timeline';
import { useApi } from '../use-api';
import { cityName, type AddressRow } from './address';

const NOT_IN_DATA = 'not in the data';

/** The value once it has stopped changing for `ms`, so dragging the date does not ask for every day it passes. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), ms); return () => clearTimeout(timer); }, [value, ms]);
  return settled;
}

function Fact({ name, value }: { name: string; value: string | number | null }) {
  const missing = value === null || value === '';
  return <div><dt>{name}</dt><dd className={missing ? 'is-missing' : ''}>{missing ? NOT_IN_DATA : value}</dd></div>;
}

function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => setState('copied'), () => setState('failed'));
  };
  return (
    <span className="copy-link">
      <button type="button" className="button-quiet" onClick={copy}><Link2 size={15} strokeWidth={1.75} aria-hidden />Copy link</button>
      <span role="status">
        {state === 'copied' && 'Link copied.'}
        {state === 'failed' && 'Could not copy; use the address bar instead.'}
      </span>
    </span>
  );
}

// One clause per non-zero count. The first clause names the noun so the sentence reads on its own.
const CLAUSES: Record<string, (n: number, noun: string) => string> = {
  applies: (n, noun) => `${noun || n} ${n === 1 ? 'applies' : 'apply'} at this address`,
  unknown: (n, noun) => `${noun || n} cannot be determined from the data`,
  superseded: (n, noun) => `${noun || n} ${n === 1 ? 'is' : 'are'} overridden by another rule`,
  not_yet_effective: (n, noun) => `${noun || n} ${n === 1 ? 'is' : 'are'} not yet in effect`,
  pending: (n, noun) => `${noun || n} ${n === 1 ? 'is' : 'are'} pending`
};
function summarySentence(asOf: string, counts: { r: string; n: number }[]): string {
  const shown = counts.filter(c => c.n > 0);
  if (shown.length === 0) return `On ${longDate(asOf)}, no rule in the extracted set reaches this address.`;
  const parts = shown.map(({ r, n }, i) => CLAUSES[r](n, i === 0 ? `${n} ${n === 1 ? 'rule' : 'rules'}` : ''));
  const list = parts.length > 2 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : parts.join(' and ');
  return `On ${longDate(asOf)}, ${list}.`;
}

export function AddressView({ chosen, asOf, caseDates, onDate }: {
  chosen: AddressRow; asOf: string | null; caseDates: string[]; onDate: (date: string) => void;
}) {
  const queryDate = useSettled(asOf, 120);
  const lookup = useApi<LookupResponse>(queryDate ? `/api/lookup?address_id=${encodeURIComponent(chosen.address_id)}&as_of=${queryDate}` : null);
  // The last answer shown for this address. While another date loads, its rows stay in place, dimmed.
  const [shown, setShown] = useState<LookupResponse | null>(null);
  // What each changed rule answered on the previous date (null: it did not reach the address then).
  const [was, setWas] = useState<{ from: string; map: Map<string, string | null>; gone: number } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const previous = useRef<LookupResponse | null>(null);

  useEffect(() => {
    const next = lookup.data;
    if (!next) return;
    const prev = previous.current;
    if (prev && prev.as_of !== next.as_of) {
      // A comparison of two answers the API gave, to show what moved. Nothing is decided here.
      const before = new Map(prev.results.map(r => [r.team_rule_id, r.result]));
      const map = new Map<string, string | null>();
      for (const r of next.results) {
        const b = before.get(r.team_rule_id);
        if (b === undefined) map.set(r.team_rule_id, null); else if (b !== r.result) map.set(r.team_rule_id, b);
      }
      const now = new Set(next.results.map(r => r.team_rule_id));
      setWas({ from: prev.as_of, map, gone: prev.results.filter(r => !now.has(r.team_rule_id)).length });
    }
    previous.current = next;
    setShown(next);
  }, [lookup.data]);

  const data = asOf ? lookup.data ?? shown : null;
  const stale = Boolean(asOf) && !lookup.data && data !== null;
  const lowConfidence = data ? data.stack.method === 'postal_fallback' || data.stack.confidence < 0.85 : false;
  const legalCityName = data ? cityName(data.stack.legal_city) : null;
  const counts = data ? RESULT_ORDER.map(r => ({ r, n: data.results.filter(x => x.result === r).length })) : [];
  const allOpen = data !== null && data.results.length > 0 && data.results.every(r => openIds.has(r.team_rule_id));
  const toggle = (id: string) => setOpenIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const changedCount = was ? was.map.size + was.gone : 0;
  // Rules the API reports as enacted but not yet in effect, soonest first: the next thing to change at this address.
  const upcoming = data ? data.results.filter(r => r.result === 'not_yet_effective' && r.rule.effective_date).sort((a, b) => (a.rule.effective_date! < b.rule.effective_date! ? -1 : 1)) : [];

  return (
    <div className="address-view">
      <section className="subject" aria-label="Property">
        <div className="subject-main">
          <h2>{streetCase(chosen.street_address)}</h2>
          <p className="subject-place">{chosen.postal_city}, {chosen.state} {chosen.zip}</p>
        </div>
        <dl className="facts">
          <Fact name="Year built" value={chosen.year_built} />
          <Fact name="Units" value={chosen.units} />
          <Fact name="Use" value={chosen.use_description} />
        </dl>
        <CopyLink />
      </section>

      {asOf && lookup.error && <p role="alert" className="error">{lookup.error}</p>}
      {asOf && !data && !lookup.error && (
        <div className="skeleton" aria-busy="true"><p>Checking the rules for {longDate(asOf)}…</p><span /><span /><span /></div>
      )}

      {data && asOf && (
        <>
          <section className="jurisdiction" aria-label="Legal jurisdiction">
            <ol data-testid="stack" className="stack">
              <li><span className="stack-term">State</span>{data.stack.state}</li>
              <li><span className="stack-term">County</span>{data.stack.county ?? NOT_IN_DATA}</li>
              <li>
                <span className="stack-term">Legal city</span>{data.stack.legal_city ?? 'none found (no incorporated city for this address)'}
                {lowConfidence && <span data-testid="low-confidence" className="low-confidence">Low confidence</span>}
              </li>
            </ol>
            <p className="stack-how">
              {lowConfidence
                ? <span className="low-confidence-why">{data.stack.note ?? `${METHOD_LABELS[data.stack.method] ?? data.stack.method}, at confidence ${data.stack.confidence.toFixed(2)}.`}</span>
                : <>Placed by address: {METHOD_LABELS[data.stack.method] ?? data.stack.method}; confidence {confidenceWords(data.stack.confidence)}.</>}
              {legalCityName && legalCityName.toLowerCase() !== data.address.postal_city.toLowerCase() && (
                <strong className="mailing"> Mailing city {data.address.postal_city}; legal city {legalCityName}.</strong>
              )}
            </p>
          </section>

          <section className="answer" aria-label="Answer">
            <p data-testid="summary-sentence" className="answer-sentence" aria-live="polite">{summarySentence(data.as_of, counts)}</p>
            <div data-testid="summary" className="filters">
              {counts.map(({ r, n }) => (
                <button key={r} type="button" className={`chip chip-${r}`} aria-pressed={filter === r} disabled={n === 0} title={RESULT_MEANINGS[r]} onClick={() => setFilter(filter === r ? null : r)}>
                  <SignalMark result={r} size={14} />{n} {label(RESULT_LABELS, r).toLowerCase()}
                </button>
              ))}
              {filter && <button type="button" className="chip chip-clear" onClick={() => setFilter(null)}>Show all</button>}
              {data.results.length > 0 && (
                <button type="button" className="button-quiet evidence-all" aria-pressed={allOpen}
                  onClick={() => setOpenIds(allOpen ? new Set() : new Set(data.results.map(r => r.team_rule_id)))}>
                  {allOpen ? 'Collapse all evidence' : 'Expand all evidence'}
                </button>
              )}
            </div>
            <p className="answer-note">
              <span data-testid="results-as-of">Answers as of {data.as_of}.</span>{' '}
              {data.not_applicable > 0 && <>{data.not_applicable} other extracted rules do not reach this address. </>}
              Each answer cites a sentence found word for word in its source.
            </p>
            {upcoming.length > 0 && (
              <p className="next-change" data-testid="next-change">
                <SignalMark result="not_yet_effective" size={14} />
                <span>Next to take effect here: <strong>{upcoming[0].rule.title}</strong>, on {longDate(upcoming[0].rule.effective_date!)}.{upcoming.length > 1 ? ` ${upcoming.length - 1} more after it.` : ''}</span>
                <button type="button" className="link" onClick={() => onDate(floorDate(upcoming[0].rule.effective_date!))}>See that day</button>
              </p>
            )}
            {was && (
              <p className="change-note" role="status" data-testid="change-note">
                {changedCount === 0
                  ? `Nothing changed between ${was.from} and ${data.as_of}.`
                  : `${changedCount} ${changedCount === 1 ? 'answer' : 'answers'} changed between ${was.from} and ${data.as_of}${was.gone ? `, ${was.gone} of them no longer reaching this address` : ''}.`}
              </p>
            )}
          </section>

          <div className={`rules ${stale ? 'is-stale' : ''}`} style={needleStyle(asOf)} aria-busy={stale}>
            <div className="rules-head">
              <span className="rules-head-answer">Answer</span>
              <span className="rules-head-rule">Rule</span>
              <div className="rules-head-axis"><TimeAxis asOf={asOf} caseDates={caseDates} onChange={onDate} /></div>
            </div>
            <div className="needle-line" aria-hidden />
            {CATEGORY_ORDER.map(cat => {
              const items = data.results.filter(r => r.rule.category === cat && (!filter || r.result === filter));
              if (filter && items.length === 0) return null;
              return (
                <section key={cat} className="category">
                  <h3>{CATEGORY_LABELS[cat]}</h3>
                  {items.length === 0
                    ? <p className="category-none">No rule found at this address for this category.</p>
                    : items.map(item => (
                      <RuleRow key={item.team_rule_id} item={item} asOf={data.as_of} needle={asOf} open={openIds.has(item.team_rule_id)}
                        was={was?.map.has(item.team_rule_id) ? was.map.get(item.team_rule_id) : undefined}
                        onToggle={() => toggle(item.team_rule_id)} onJump={onDate} />
                    ))}
                </section>
              );
            })}
            <div className="legend" aria-label="How to read the time column">
              <span><i className="legend-line" /> in force</span>
              <span><i className="legend-line legend-lead" /> enacted, not yet in effect</span>
              <span><i className="legend-line legend-dashed" /> pending proposal</span>
              <span><i className="legend-line legend-open" /> no start date stated</span>
              <span><i className="legend-needle" /> the date you chose</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

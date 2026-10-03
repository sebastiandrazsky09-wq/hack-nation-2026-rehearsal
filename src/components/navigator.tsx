'use client';
import { Link2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangesResponse, LookupResponse, PipelineResponse } from '../server/ordinal';
import { AuditTable } from './audit-table';
import { ChangesPanel } from './changes-panel';
import { PipelinePanel } from './pipeline-panel';
import { CATEGORY_LABELS, CATEGORY_ORDER, DEFAULT_AS_OF, METHOD_LABELS, RESULT_LABELS, RESULT_MEANINGS, RESULT_ORDER, confidenceWords, isIsoDate, label, longDate, shortDate, streetCase } from './labels';
import { RuleRow } from './rule-card';
import { SignalMark } from './signal';
import { TimeAxis, floorDate, frac, needleStyle, toDay } from './timeline';
import { useApi } from './use-api';

type AddressRow = {
  address_id: string; street_address: string; postal_city: string; state: string; zip: string;
  year_built: number | null; units: number | null; use_description: string; legal_city: string | null;
};
type Tab = 'address' | 'audit' | 'changes' | 'pipeline';
const TABS: { id: Tab; name: string }[] = [
  { id: 'address', name: 'Rules at this address' },
  { id: 'audit', name: 'All extracted rules' },
  { id: 'changes', name: 'What is changing' },
  { id: 'pipeline', name: 'How it was produced' }
];
const NOT_IN_DATA = 'not in the data';
const optionText = (a: AddressRow) => `${streetCase(a.street_address)}, ${a.postal_city}, ${a.state} (${a.address_id})`;
const cityName = (legal: string | null) => legal?.split(',')[0] ?? null;

// Example buttons are picked from the address list by property, so no address id is written here.
const EXAMPLES: { label: string; shows: string; pick: (a: AddressRow) => boolean }[] = [
  { label: 'A 1978 building in Los Angeles: a cutoff year', shows: 'Rent stabilization turns on a 1978 certificate date. A year alone cannot settle it, so the answer is unknown and says why.', pick: a => a.year_built === 1978 && cityName(a.legal_city) === 'Los Angeles' },
  { label: 'Mailing city is not the legal city', shows: 'The mail says one place; the law follows another. The address is placed in its legal city first.', pick: a => { const c = cityName(a.legal_city); return c !== null && c.toLowerCase() !== a.postal_city.toLowerCase(); } },
  { label: 'A city rule and a state rule in tension', shows: 'A local ban is in force. A state act that bars conflicting local rules starts later. Both are flagged for review.', pick: a => cityName(a.legal_city) === 'Hoboken' },
  { label: 'Pending bills', shows: 'Two bills would reach this address if enacted. They are shown as pending, never as law.', pick: a => cityName(a.legal_city) === 'Cambridge' }
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden focusable={false}>
      <path d="M3 7h16M8 11.5h11M13 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M11 3.5v15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="3.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Navigator() {
  const addressesApi = useApi<{ addresses: AddressRow[] }>('/api/addresses');
  const changesApi = useApi<ChangesResponse>('/api/changes');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);
  // The dates the change cases are evaluated on, offered as one-press dates. They come from the API, not from this file.
  const caseDates = useMemo(() => [...new Set((changesApi.data?.cases ?? []).flatMap(c => c.dates))].filter(isIsoDate).sort(), [changesApi.data]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState('');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [tab, setTab] = useState<Tab>('address');
  const hydrated = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const choose = (a: AddressRow) => { setAddressId(a.address_id); setQuery(optionText(a)); setOpen(false); setTab('address'); };
  const openAddress = (id: string, date: string) => {
    const a = addresses.find(x => x.address_id === id);
    if (a) setQuery(optionText(a));
    setAddressId(id); setAsOf(date); setOpen(false); setTab('address');
  };

  // Read ?address, ?as_of and ?tab once, when the address list arrives. Unknown values keep the defaults.
  useEffect(() => {
    if (hydrated.current || addresses.length === 0) return;
    hydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('address');
    const a = id ? addresses.find(x => x.address_id === id) : undefined;
    const date = params.get('as_of');
    const wantedTab = TABS.find(t => t.id === params.get('tab'));
    if (a) { setAddressId(a.address_id); setQuery(optionText(a)); }
    if (date && isIsoDate(date)) setAsOf(date);
    if (wantedTab) setTab(wantedTab.id);
  }, [addresses]);

  // Keep the URL in step with the page so it can be shared. Skipped until the incoming URL has been read.
  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    if (addressId) params.set('address', addressId);
    if (isIsoDate(asOf) && (addressId || asOf !== DEFAULT_AS_OF)) params.set('as_of', asOf);
    if (addressId || tab !== 'address') params.set('tab', tab);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [addressId, asOf, tab]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? addresses.filter(a => `${a.address_id} ${a.street_address} ${a.postal_city} ${a.legal_city ?? ''}`.toLowerCase().includes(q)) : addresses;
    return hits.slice(0, 8);
  }, [addresses, query]);
  const chosen = addresses.find(a => a.address_id === addressId) ?? null;
  const validDate = isIsoDate(asOf) ? asOf : null;

  // Arrow keys move through the suggestions, Enter chooses (native button), Escape returns to the field.
  const moveFocus = (from: number, step: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const next = from + step;
    if (next < 0) inputRef.current?.focus(); else buttons[Math.min(next, buttons.length - 1)]?.focus();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="page topbar-inner">
          <h1 className="brand"><Logo />Ordinal</h1>
          <div role="tablist" aria-label="Views" className="tabs">
            {TABS.map(t => (
              <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="panel" onClick={() => setTab(t.id)}>{t.name}</button>
            ))}
          </div>
          <p role="note" className="notice"><strong>Not legal advice.</strong> A prototype: check the cited source.</p>
        </div>
      </header>

      <section className="querybar" aria-label="Place and date">
        <div className="page query-inner">
          <div className="field field-address">
            <label htmlFor="address-input">Address</label>
            <div className="search">
              <Search size={18} strokeWidth={1.75} aria-hidden className="search-icon" />
              <input
                ref={inputRef} id="address-input" type="search" autoComplete="off" placeholder="Search 500 sample addresses by street, city or id"
                value={query} disabled={addressesApi.loading}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (open) moveFocus(-1, 1); else { setOpen(true); requestAnimationFrame(() => moveFocus(-1, 1)); }
                  }
                }}
              />
              {open && (
                <ul ref={listRef} className="matches" aria-label="Suggestions">
                  {matches.length === 0 && <li className="matches-none">No address matches “{query}”. Try a street name, a city, or an id such as A0002.</li>}
                  {matches.map((a, i) => (
                    <li key={a.address_id}>
                      <button
                        type="button" onClick={() => choose(a)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(i, 1); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(i, -1); }
                          if (e.key === 'Escape') { setOpen(false); inputRef.current?.focus(); }
                        }}
                      >
                        <span className="match-street">{streetCase(a.street_address)}</span>
                        <span className="match-place">{a.postal_city}, {a.state}</span>
                        <span className="match-id">{a.address_id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {addressesApi.error && <p role="alert" className="error">{addressesApi.error}</p>}
          </div>
          <div className="field field-date">
            <label htmlFor="as-of-input">As of</label>
            <div className="date-row">
              <input id="as-of-input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
              {caseDates.length > 0 && (
                <div className="quick" role="group" aria-label="Dates the change cases use">
                  {caseDates.map(d => <button key={d} type="button" aria-pressed={asOf === d} onClick={() => setAsOf(d)}>{d}</button>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <main id="panel" role="tabpanel" className="page main">
        {!validDate && (tab === 'address' || tab === 'audit') && <p role="alert" className="error">Enter a real date as year-month-day, for example 2026-10-01.</p>}
        {tab === 'audit' && <AuditTable asOf={validDate} />}
        {tab === 'changes' && <ChangesPanel addresses={addresses} onOpen={openAddress} />}
        {tab === 'pipeline' && <PipelinePanel />}
        {tab === 'address' && !chosen && (
          <EmptyState
            loading={addressesApi.loading}
            examples={EXAMPLES.map(e => ({ label: e.label, shows: e.shows, address: addresses.find(e.pick) ?? null }))}
            cases={changesApi.data?.cases ?? []}
            asOf={validDate}
            onExample={id => openAddress(id, validDate ?? DEFAULT_AS_OF)}
            onTab={setTab}
          />
        )}
        {tab === 'address' && chosen && (
          <AddressView key={chosen.address_id} chosen={chosen} asOf={validDate} caseDates={caseDates} onDate={setAsOf} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ loading, examples, cases, asOf, onExample, onTab }: {
  loading: boolean; examples: { label: string; shows: string; address: AddressRow | null }[];
  cases: ChangesResponse['cases']; asOf: string | null; onExample: (id: string) => void; onTab: (tab: Tab) => void;
}) {
  const pipeline = useApi<PipelineResponse>('/api/pipeline');
  const metrics = pipeline.data?.selfcheck?.metrics;
  const n = (key: string) => (typeof metrics?.[key] === 'number' ? (metrics[key] as number) : 0);
  // Each change case at the latest date it looks at, in date order.
  const tracked = cases.map(c => ({ c, at: [...c.dates].sort().at(-1) ?? '' })).filter(t => isIsoDate(t.at)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return (
    <div className="empty">
      <div className="empty-lead">
        <h2>Which housing rules apply at this address, on this day?</h2>
        <p>Choose one of 500 sample addresses in California, New Jersey and Massachusetts. Ordinal places it in its legal city, tests each law&rsquo;s dates and conditions against the building, and shows the sentence of law behind every answer.</p>
        <h3>Every rule gets one of five answers</h3>
        <dl className="answers-key">
          {RESULT_ORDER.map(r => (
            <div key={r}><dt className={`signal signal-${r}`}><SignalMark result={r} />{label(RESULT_LABELS, r)}</dt><dd>{RESULT_MEANINGS[r]}</dd></div>
          ))}
        </dl>
        {metrics && (
          <p className="provenance-line">
            Built from {n('official_docs_processed') + n('supplemental_docs_processed') + n('ingested_docs')} public documents. {n('rules_verified')} of {n('rules_total')} extracted rules carry a quote found word for word in its source, and {n('addresses_resolved')} of {n('addresses_total')} addresses are placed in their legal city.{' '}
            <button type="button" className="link" onClick={() => onTab('pipeline')}>See how it was produced</button>
          </p>
        )}
      </div>
      <section className="examples" aria-labelledby="examples-heading">
        <h3 id="examples-heading">Try an example</h3>
        <ul>
          {examples.map((e, i) => (
            <li key={e.label}>
              <button type="button" disabled={e.address === null || loading} aria-describedby={`example-${i}`} onClick={() => e.address && onExample(e.address.address_id)}>{e.label}</button>
              <p id={`example-${i}`}>
                {e.address && <span className="example-where">{streetCase(e.address.street_address)}, {e.address.postal_city}, {e.address.state}. </span>}
                {e.shows}
              </p>
            </li>
          ))}
        </ul>
      </section>
      {tracked.length > 0 && (
        <section className="tracking" aria-label="Tracked changes" style={asOf ? needleStyle(asOf) : undefined}>
          <h3>Changes in the law, and how many of the 500 sample properties each one reaches</h3>
          <ol>
            {tracked.map(({ c, at }) => (
              <li key={c.test_id}>
                <a href="?tab=changes" onClick={e => { e.preventDefault(); onTab('changes'); }}>
                  <span className="tracking-date">{shortDate(at)}</span>
                  <span className="tracking-title">{c.title ?? c.test_id}</span>
                  <span className="tracking-track" aria-hidden><i style={{ left: `${(frac(toDay(at)) * 100).toFixed(3)}%` }} /></span>
                  <span className="tracking-n">{c.affected_address_ids.length} {c.affected_address_ids.length === 1 ? 'address' : 'addresses'}</span>
                </a>
              </li>
            ))}
          </ol>
          {asOf && <div className="tracking-needle" aria-hidden><em>{shortDate(asOf)}</em></div>}
        </section>
      )}
    </div>
  );
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

function AddressView({ chosen, asOf, caseDates, onDate }: {
  chosen: AddressRow; asOf: string | null; caseDates: string[]; onDate: (date: string) => void;
}) {
  const lookup = useApi<LookupResponse>(asOf ? `/api/lookup?address_id=${encodeURIComponent(chosen.address_id)}&as_of=${asOf}` : null);
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
                      <RuleRow key={item.team_rule_id} item={item} asOf={data.as_of} open={openIds.has(item.team_rule_id)}
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

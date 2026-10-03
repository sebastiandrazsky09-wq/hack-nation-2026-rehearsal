'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LookupResponse } from '../server/ordinal';
import { AuditTable } from './audit-table';
import { ChangesPanel } from './changes-panel';
import { PipelinePanel } from './pipeline-panel';
import { CATEGORY_LABELS, CATEGORY_ORDER, DEFAULT_AS_OF, METHOD_LABELS, QUICK_DATES, RESULT_LABELS, RESULT_ORDER, confidenceWords, label } from './labels';
import { RuleCard } from './rule-card';
import { useApi } from './use-api';

type AddressRow = {
  address_id: string; street_address: string; postal_city: string; state: string; zip: string;
  year_built: number | null; units: number | null; use_description: string; legal_city: string | null;
};
type Tab = 'address' | 'audit' | 'changes' | 'pipeline';
const TABS: Tab[] = ['address', 'audit', 'changes', 'pipeline'];
const NOT_IN_DATA = 'not in the data';
const optionText = (a: AddressRow) => `${a.address_id} · ${a.street_address}, ${a.postal_city}, ${a.state}`;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const cityName = (legal: string | null) => legal?.split(',')[0] ?? null;

// Example buttons are picked from the address list by property, so no address id is written here.
const EXAMPLES: { label: string; pick: (a: AddressRow) => boolean }[] = [
  { label: 'A 1978 building in Los Angeles: a cutoff year', pick: a => a.year_built === 1978 && cityName(a.legal_city) === 'Los Angeles' },
  { label: 'Mailing city is not the legal city', pick: a => { const c = cityName(a.legal_city); return c !== null && c.toLowerCase() !== a.postal_city.toLowerCase(); } },
  { label: 'A city rule and a state rule in tension', pick: a => cityName(a.legal_city) === 'Hoboken' },
  { label: 'Pending bills', pick: a => cityName(a.legal_city) === 'Cambridge' }
];

export function Navigator() {
  const addressesApi = useApi<{ addresses: AddressRow[] }>('/api/addresses');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState('');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [tab, setTab] = useState<Tab>('address');
  const hydrated = useRef(false);
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
    const wantedTab = TABS.find(t => t === params.get('tab'));
    if (a) { setAddressId(a.address_id); setQuery(optionText(a)); }
    if (date && isDate(date) && !Number.isNaN(Date.parse(date))) setAsOf(date);
    if (wantedTab) setTab(wantedTab);
  }, [addresses]);

  // Keep the URL in step with the page so it can be shared. Skipped until the incoming URL has been read.
  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    if (addressId) params.set('address', addressId);
    if (isDate(asOf) && (addressId || asOf !== DEFAULT_AS_OF)) params.set('as_of', asOf);
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
  const validDate = isDate(asOf) ? asOf : null;

  const lookup = useApi<LookupResponse>(addressId && validDate ? `/api/lookup?address_id=${encodeURIComponent(addressId)}&as_of=${validDate}` : null);

  return (
    <div>
      <header className="site-header">
        <div className="page">
          <h1>Ordinal</h1>
          <p className="tagline">Pick an address and a date to see which rental housing rules apply there, and the exact law text behind each answer.</p>
          <p role="note" className="notice"><strong>Not legal advice.</strong> A prototype that reads public law; check the cited source before acting.</p>
        </div>
      </header>
      <main className="page">
        <section className="controls">
          <div className="relative min-w-0">
            <label htmlFor="address-input" className="field-label">Address</label>
            <input
              id="address-input" type="search" autoComplete="off" className="input" placeholder="Search by id, street or city"
              value={query} disabled={addressesApi.loading}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
            />
            {addressesApi.error && <p role="alert" className="error mt-2">{addressesApi.error}</p>}
            {open && (
              <ul className="matches" aria-label="Matching results">
                {matches.length === 0 && <li className="px-3 py-2 text-[var(--muted)]">No address matches “{query}”.</li>}
                {matches.map(a => (
                  <li key={a.address_id}>
                    <button type="button" onClick={() => { setAddressId(a.address_id); setQuery(optionText(a)); setOpen(false); }}>{optionText(a)}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <label htmlFor="as-of-input" className="field-label">As of</label>
            <input id="as-of-input" type="date" className="input" value={asOf} onChange={e => setAsOf(e.target.value)} />
            <div className="quick">
              {QUICK_DATES.map(d => <button key={d} type="button" aria-pressed={asOf === d} onClick={() => setAsOf(d)}>{d}</button>)}
            </div>
          </div>
        </section>

        <div role="tablist" className="tabs">
          <button role="tab" type="button" id="tab-address" aria-selected={tab === 'address'} aria-controls="panel" onClick={() => setTab('address')}>Rules at this address</button>
          <button role="tab" type="button" id="tab-audit" aria-selected={tab === 'audit'} aria-controls="panel" onClick={() => setTab('audit')}>All extracted rules</button>
          <button role="tab" type="button" id="tab-changes" aria-selected={tab === 'changes'} aria-controls="panel" onClick={() => setTab('changes')}>What is changing</button>
          <button role="tab" type="button" id="tab-pipeline" aria-selected={tab === 'pipeline'} aria-controls="panel" onClick={() => setTab('pipeline')}>How it was produced</button>
        </div>

        <div id="panel" role="tabpanel" aria-live="polite" className="panel">
          {!validDate && (tab === 'address' || tab === 'audit') && <p role="alert" className="error">Enter a real date as year-month-day, for example 2026-10-01.</p>}
          {tab === 'audit' && <AuditTable asOf={validDate} />}
          {tab === 'changes' && <ChangesPanel addresses={addresses} onOpen={openAddress} />}
          {tab === 'pipeline' && <PipelinePanel />}
          {tab === 'address' && (
            <AddressPanel chosen={chosen} asOf={validDate} lookup={lookup}
              examples={chosen ? [] : EXAMPLES.map(e => ({ label: e.label, id: addresses.find(e.pick)?.address_id ?? null }))}
              onExample={id => openAddress(id, validDate ?? DEFAULT_AS_OF)} />
          )}
        </div>
      </main>
    </div>
  );
}

function Fact({ name, value }: { name: string; value: string | number | null }) {
  const missing = value === null || value === '';
  return <div><dt>{name}</dt><dd className={missing ? 'text-[var(--muted)]' : ''}>{missing ? NOT_IN_DATA : value}</dd></div>;
}

function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => setState('copied'), () => setState('failed'));
  };
  return (
    <span className="copy-link">
      <button type="button" className="quiet-button" onClick={copy}>Copy link</button>
      <span role="status" className="text-sm text-[var(--muted)]">
        {state === 'copied' && 'Link copied.'}
        {state === 'failed' && 'Could not copy; use the address bar instead.'}
      </span>
    </span>
  );
}

function AddressPanel({ chosen, asOf, lookup, examples, onExample }: {
  chosen: AddressRow | null; asOf: string | null; lookup: ReturnType<typeof useApi<LookupResponse>>;
  examples: { label: string; id: string | null }[]; onExample: (id: string) => void;
}) {
  if (!chosen) {
    return (
      <div>
        <p className="text-[var(--muted)]">Choose an address above to see its legal jurisdiction and the rules that reach it.</p>
        <section className="examples" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="examples-title">Try an example</h2>
          <div className="examples-list">
            {examples.map(e => (
              <button key={e.label} type="button" disabled={e.id === null} onClick={() => e.id && onExample(e.id)}>{e.label}</button>
            ))}
          </div>
        </section>
      </div>
    );
  }
  const { data, error, loading } = lookup;
  return (
    <div>
      <div className="heading-row">
        <h2>{chosen.street_address}, {chosen.postal_city}, {chosen.state} {chosen.zip}</h2>
        <CopyLink />
      </div>
      <dl className="facts">
        <Fact name="Year built" value={chosen.year_built} />
        <Fact name="Units" value={chosen.units} />
        <Fact name="Use" value={chosen.use_description} />
      </dl>
      {asOf && loading && <p className="mt-4 text-[var(--muted)]">Checking the rules for {asOf}…</p>}
      {asOf && error && <p role="alert" className="error mt-4">{error}</p>}
      {asOf && data && <Results key={`${data.address.address_id}|${data.as_of}`} data={data} />}
    </div>
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
  if (shown.length === 0) return 'No rule in the extracted set reaches this address on this date.';
  const parts = shown.map(({ r, n }, i) => CLAUSES[r](n, i === 0 ? `${n} ${n === 1 ? 'rule' : 'rules'}` : ''));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : parts[0];
  return `On ${asOf}, ${list}.`;
}

function Results({ data }: { data: LookupResponse }) {
  const [filter, setFilter] = useState<string | null>(null);
  const { stack, address } = data;
  const legalCityName = cityName(stack.legal_city);
  const counts = RESULT_ORDER.map(r => ({ r, n: data.results.filter(x => x.result === r).length }));
  const lowConfidence = stack.method === 'postal_fallback' || stack.confidence < 0.85;
  return (
    <div>
      <h3>Legal jurisdiction</h3>
      <ol data-testid="stack" className="stack">
        <li><span className="field">State</span> {stack.state}</li>
        <li><span className="field">County</span> {stack.county ?? NOT_IN_DATA}</li>
        <li>
          <span className="field">Legal city</span> {stack.legal_city ?? 'none found (no incorporated city for this address)'}
          {lowConfidence && <span data-testid="low-confidence" className="low-confidence">Low confidence</span>}
        </li>
      </ol>
      {lowConfidence && (
        <p className="low-confidence-why mt-2">
          {stack.note ?? `${METHOD_LABELS[stack.method] ?? stack.method}, at confidence ${stack.confidence.toFixed(2)}.`}
        </p>
      )}
      <p className="mt-2">
        Resolution: {METHOD_LABELS[stack.method] ?? stack.method}; confidence {confidenceWords(stack.confidence)}.
        {!lowConfidence && stack.note ? ` ${stack.note}` : ''}
      </p>
      {legalCityName && legalCityName.toLowerCase() !== address.postal_city.toLowerCase() && (
        <p className="mt-1 font-medium">Mailing city {address.postal_city}; legal city {legalCityName}.</p>
      )}

      <h3 data-testid="results-as-of">Rules as of {data.as_of}</h3>
      <p data-testid="summary-sentence" className="summary-sentence">{summarySentence(data.as_of, counts)}</p>
      <div data-testid="summary" className="summary">
        {counts.map(({ r, n }) => (
          <button key={r} type="button" className="chip" aria-pressed={filter === r} disabled={n === 0} onClick={() => setFilter(filter === r ? null : r)}>
            {n} {label(RESULT_LABELS, r).toLowerCase()}
          </button>
        ))}
        {filter && <button type="button" className="chip chip-clear" onClick={() => setFilter(null)}>Show all</button>}
        {data.not_applicable > 0 && <span className="text-[var(--muted)]">({data.not_applicable} other extracted rules do not reach this address)</span>}
      </div>

      {CATEGORY_ORDER.map(cat => {
        const items = data.results.filter(r => r.rule.category === cat && (!filter || r.result === filter));
        if (filter && items.length === 0) return null;
        return (
          <section key={cat} className="category">
            <h3>{CATEGORY_LABELS[cat]}</h3>
            {items.length === 0
              ? <p className="text-[var(--muted)]">No rule found at this address for this category.</p>
              : items.map(item => <RuleCard key={item.team_rule_id} item={item} asOf={data.as_of} />)}
          </section>
        );
      })}
    </div>
  );
}

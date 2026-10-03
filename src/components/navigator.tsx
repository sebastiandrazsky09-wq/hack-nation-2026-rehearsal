'use client';
import { useMemo, useState } from 'react';
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
const NOT_IN_DATA = 'not in the data';
const optionText = (a: AddressRow) => `${a.address_id} · ${a.street_address}, ${a.postal_city}, ${a.state}`;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function Navigator() {
  const addressesApi = useApi<{ addresses: AddressRow[] }>('/api/addresses');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState('');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [tab, setTab] = useState<'address' | 'audit' | 'changes' | 'pipeline'>('address');
  const openAddress = (id: string, date: string) => {
    const a = addresses.find(x => x.address_id === id);
    if (a) setQuery(optionText(a));
    setAddressId(id); setAsOf(date); setOpen(false); setTab('address');
  };

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
          {tab === 'address' && <AddressPanel chosen={chosen} asOf={validDate} lookup={lookup} />}
        </div>
      </main>
    </div>
  );
}

function Fact({ name, value }: { name: string; value: string | number | null }) {
  const missing = value === null || value === '';
  return <div><dt>{name}</dt><dd className={missing ? 'text-[var(--muted)]' : ''}>{missing ? NOT_IN_DATA : value}</dd></div>;
}

function AddressPanel({ chosen, asOf, lookup }: { chosen: AddressRow | null; asOf: string | null; lookup: ReturnType<typeof useApi<LookupResponse>> }) {
  if (!chosen) return <p className="text-[var(--muted)]">Choose an address above to see its legal jurisdiction and the rules that reach it.</p>;
  const { data, error, loading } = lookup;
  return (
    <div>
      <h2>{chosen.street_address}, {chosen.postal_city}, {chosen.state} {chosen.zip}</h2>
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

function Results({ data }: { data: LookupResponse }) {
  const [filter, setFilter] = useState<string | null>(null);
  const { stack, address } = data;
  const legalCityName = stack.legal_city?.split(',')[0] ?? null;
  const counts = RESULT_ORDER.map(r => ({ r, n: data.results.filter(x => x.result === r).length }));
  return (
    <div>
      <h3>Legal jurisdiction</h3>
      <ol data-testid="stack" className="stack">
        <li><span className="field">State</span> {stack.state}</li>
        <li><span className="field">County</span> {stack.county ?? NOT_IN_DATA}</li>
        <li><span className="field">Legal city</span> {stack.legal_city ?? 'none found (no incorporated city for this address)'}</li>
      </ol>
      <p className="mt-2">
        Resolution: {METHOD_LABELS[stack.method] ?? stack.method}; confidence {confidenceWords(stack.confidence)}.
        {stack.note ? ` ${stack.note}` : ''}
      </p>
      {legalCityName && legalCityName.toLowerCase() !== address.postal_city.toLowerCase() && (
        <p className="mt-1 font-medium">Mailing city {address.postal_city}; legal city {legalCityName}.</p>
      )}

      <h3 data-testid="results-as-of">Rules as of {data.as_of}</h3>
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

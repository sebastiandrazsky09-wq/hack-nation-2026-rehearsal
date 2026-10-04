'use client';
import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangesResponse } from '../../server/ordinal';
import { DEFAULT_AS_OF, isIsoDate, streetCase } from '../labels';
import { useApi } from '../use-api';
import { optionText, type AddressRow } from './address';
import { AddressView } from './address-view';
import { EXAMPLES, EmptyState } from './empty-state';

/** /record: search, the as-of date and the address view. The address and date live in the URL as ?address= and ?as_of=. */
export function RecordView() {
  const addressesApi = useApi<{ addresses: AddressRow[] }>('/api/addresses');
  const changesApi = useApi<ChangesResponse>('/api/changes');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);
  // The dates the change cases are evaluated on, offered as one-press dates. They come from the API, not from this file.
  const caseDates = useMemo(() => [...new Set((changesApi.data?.cases ?? []).flatMap(c => c.dates))].filter(isIsoDate).sort(), [changesApi.data]);
  const incoming = useSearchParams();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState('');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const hydrated = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const choose = (a: AddressRow) => { setAddressId(a.address_id); setQuery(optionText(a)); setOpen(false); };
  const openAddress = (id: string, date: string) => {
    const a = addresses.find(x => x.address_id === id);
    if (a) setQuery(optionText(a));
    setAddressId(id); setAsOf(date); setOpen(false);
  };

  // Read ?address and ?as_of once, when the address list arrives. Unknown values keep the defaults.
  useEffect(() => {
    if (hydrated.current || addresses.length === 0) return;
    hydrated.current = true;
    const id = incoming.get('address');
    const a = id ? addresses.find(x => x.address_id === id) : undefined;
    const date = incoming.get('as_of');
    if (a) { setAddressId(a.address_id); setQuery(optionText(a)); }
    if (date && isIsoDate(date)) setAsOf(date);
  }, [addresses, incoming]);

  // Keep the URL in step with the page so it can be shared. Skipped until the incoming URL has been read.
  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    if (addressId) params.set('address', addressId);
    if (isIsoDate(asOf) && (addressId || asOf !== DEFAULT_AS_OF)) params.set('as_of', asOf);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [addressId, asOf]);

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
    <>
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

      <main className="page main">
        {!validDate && <p role="alert" className="error">Enter a real date as year-month-day, for example 2026-10-01.</p>}
        {!chosen && (
          <EmptyState
            loading={addressesApi.loading}
            examples={EXAMPLES.map(e => ({ label: e.label, shows: e.shows, address: addresses.find(e.pick) ?? null }))}
            cases={changesApi.data?.cases ?? []}
            asOf={validDate}
            onExample={id => openAddress(id, validDate ?? DEFAULT_AS_OF)}
          />
        )}
        {chosen && (
          <AddressView key={chosen.address_id} chosen={chosen} asOf={validDate} caseDates={caseDates} onDate={setAsOf} />
        )}
      </main>
    </>
  );
}

'use client';
import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { streetCase } from '../labels';
import { optionText, type AddressRow } from './address';

/**
 * The address field: a search box over the sample addresses with a keyboard-reachable suggestion list. Shared by /record and the
 * Check screen. The text in the box is owned by the caller so it can be filled from a URL; choosing a suggestion reports it and
 * writes its text back through `onQuery`.
 */
export function AddressSearch({ id, label = 'Address', addresses, query, onQuery, onChoose, loading = false, error }: {
  id: string; label?: string; addresses: AddressRow[]; query: string; onQuery: (text: string) => void;
  onChoose: (address: AddressRow) => void; loading?: boolean; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? addresses.filter(a => `${a.address_id} ${a.street_address} ${a.postal_city} ${a.legal_city ?? ''}`.toLowerCase().includes(q)) : addresses;
    return hits.slice(0, 8);
  }, [addresses, query]);

  const choose = (a: AddressRow) => { onQuery(optionText(a)); onChoose(a); setOpen(false); };

  // Arrow keys move through the suggestions, Enter chooses (native button), Escape returns to the field.
  const moveFocus = (from: number, step: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const next = from + step;
    if (next < 0) inputRef.current?.focus(); else buttons[Math.min(next, buttons.length - 1)]?.focus();
  };

  return (
    <div className="field field-address">
      <label htmlFor={id}>{label}</label>
      <div className="search">
        <Search size={18} strokeWidth={1.75} aria-hidden className="search-icon" />
        <input
          ref={inputRef} id={id} type="search" autoComplete="off" placeholder={addresses.length ? `Search ${addresses.length} sample addresses by street, city or id` : 'Search the sample addresses by street, city or id'}
          value={query} disabled={loading}
          onChange={e => { onQuery(e.target.value); setOpen(true); }}
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
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

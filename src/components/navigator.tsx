'use client';
// Skeleton by the lead: proves the data path. The UI task replaces the markup and styling, not the API contract.
import { useEffect, useState } from 'react';
import type { LookupResponse } from '../server/ordinal';
type AddressRow = { address_id: string; street_address: string; postal_city: string; state: string; legal_city: string | null };
export function Navigator() {
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [addressId, setAddressId] = useState('');
  const [asOf, setAsOf] = useState('2026-10-01');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/addresses').then(r => r.json()).then(d => { setAddresses(d.addresses); setAddressId(d.addresses[0]?.address_id ?? ''); }).catch(() => setError('Could not load addresses.')); }, []);
  useEffect(() => {
    if (!addressId) return;
    fetch(`/api/lookup?address_id=${addressId}&as_of=${asOf}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); setError(''); }).catch(e => { setData(null); setError(e.message); });
  }, [addressId, asOf]);
  return <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
    <h1>Ordinal</h1>
    <p role="note"><strong>Not legal advice.</strong> A prototype that reads public housing law; check the cited source before acting.</p>
    <label>Address <select aria-label="Address" value={addressId} onChange={e => setAddressId(e.target.value)}>{addresses.map(a => <option key={a.address_id} value={a.address_id}>{a.address_id} · {a.street_address}, {a.postal_city}, {a.state}</option>)}</select></label>{' '}
    <label>As of <input aria-label="As of" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    {data && <section aria-live="polite">
      <p data-testid="stack">Legal jurisdiction: {data.stack.legal_city ?? 'no incorporated city'} · {data.stack.county ?? 'county unknown'} · {data.stack.state} (method: {data.stack.method}, confidence {data.stack.confidence})</p>
      <p>{data.results.length} rule(s) as of {data.as_of}</p>
      {data.results.map(r => <article key={r.team_rule_id} data-testid="rule-card" style={{ border: '1px solid #dce3dc', borderRadius: 8, padding: 12, margin: '12px 0' }}>
        <p><strong>{r.result}</strong> · {r.rule.category} · {r.rule.jurisdiction} · status {r.rule.status}{r.conflict_flag ? ' · conflict flagged for review' : ''}</p>
        <h2 style={{ fontSize: 16 }}>{r.rule.title}</h2>
        <p>{r.rule.requirement}</p>
        {r.rule.key_value && <p>Key value: {r.rule.key_value}</p>}
        <p>{r.explanation}</p>
        <blockquote>“{r.rule.quoted_span}”</blockquote>
        <p>{r.rule.citation} · <a href={r.rule.source_url}>{r.rule.source_doc_id} source</a> · retrieved {r.rule.retrieved_at ?? 'unknown'} · as of {data.as_of}</p>
      </article>)}
    </section>}
  </main>;
}

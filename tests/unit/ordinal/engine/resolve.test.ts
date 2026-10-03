import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runResolve, type ResolveDeps } from '../../../../src/ordinal/resolve';
import { buildVariants } from '../../../../src/ordinal/resolve/variants';
import { readStacks } from '../../../../src/ordinal/corpus';
import { makeAddress } from './helpers';

type Body = unknown;
const hit = (state: string, place: string | null, county = 'Test County'): Body => ({
  result: { addressMatches: [{ matchedAddress: `X, ${state}`, geographies: {
    States: [{ STUSAB: state }], Counties: [{ NAME: county }], ...(place ? { 'Incorporated Places': [{ BASENAME: place, NAME: `${place} city` }] } : {})
  } }] }
});
const miss: Body = { result: { addressMatches: [] } };

function harness(respond: (query: string) => Body) {
  const queries: string[] = [];
  const fetchFn = (async (url: string) => {
    const query = new URL(url).searchParams.get('address')!; queries.push(query);
    return { ok: true, status: 200, json: async () => respond(query) };
  }) as unknown as typeof fetch;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ordinal-resolve-'));
  const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps & { stacksPath: string; cacheDir: string } => ({ fetch: fetchFn, cacheDir: path.join(dir, 'geocode'), stacksPath: path.join(dir, 'stacks.json'), sleep: async () => {}, now: () => '2026-10-01T00:00:00Z', ...over });
  return { queries, deps, dir };
}

describe('resolver', () => {
  it('as-given match: legal_city from the incorporated place, confidence 0.95, raw response cached', async () => {
    const h = harness(() => hit('CA', 'Los Angeles'));
    const a = makeAddress({ address_id: 'T1', postal_city: 'Hollywood' });
    const report = await runResolve({}, h.deps({ addresses: [a] }));
    const stack = readStacks(h.deps().stacksPath)['T1'];
    expect(report).toEqual({ total: 1, by_method: { geocoder: 1 }, unresolved: [] });
    expect(stack).toMatchObject({ method: 'geocoder', confidence: 0.95, legal_city: 'Los Angeles, CA', county: 'Test County', state: 'CA' });
    expect(stack.note).toContain('as_given');
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0]).toContain('90000');
    const cached = JSON.parse(readFileSync(path.join(h.deps().cacheDir!, 'T1.json'), 'utf8'));
    expect(cached.address_id).toBe('T1');
    expect(cached.attempts[0]).toMatchObject({ variant: 'as_given', retrieved_at: '2026-10-01T00:00:00Z' });
  });

  it('range variant: house-number range matches on the first number at confidence 0.85', async () => {
    const h = harness(q => (q.startsWith('1031 CLINTON ST') ? hit('NJ', 'Hoboken') : miss));
    const a = makeAddress({ address_id: 'T2', street_address: '1031-1035 CLINTON ST', postal_city: 'Hoboken', state: 'NJ', zip: '07030' });
    await runResolve({}, h.deps({ addresses: [a] }));
    const stack = readStacks(h.deps().stacksPath)['T2'];
    expect(stack).toMatchObject({ method: 'geocoder', confidence: 0.85, legal_city: 'Hoboken, NJ' });
    expect(stack.note).toContain('range_first');
    expect(h.queries.map(q => q.startsWith('1031-1035'))).toEqual([true, true, false]);
  });

  it('builds ordered, de-duplicated variants including unit and house-letter removal', () => {
    const labels = (street: string) => buildVariants({ street_address: street, postal_city: 'X', state: 'CA', zip: '' }).map(v => v.variant);
    expect(labels('12A MAIN ST APT 4')).toEqual(['as_given', 'unit_removed', 'house_letter_removed']);
    expect(buildVariants({ street_address: '10 1/2 ELM ST #3', postal_city: 'X', state: 'CA', zip: '90001' }).map(v => v.query)).toContain('10 ELM ST, X, CA');
  });

  it('no match: postal_fallback through the neighbourhood table (Dorchester -> Boston, MA)', async () => {
    const h = harness(() => miss);
    const a = makeAddress({ address_id: 'T3', street_address: '5 NOWHERE RD', postal_city: 'Dorchester', state: 'MA', zip: '02124' });
    await runResolve({}, h.deps({ addresses: [a] }));
    expect(readStacks(h.deps().stacksPath)['T3']).toMatchObject({ method: 'postal_fallback', confidence: 0.5, county: null, legal_city: 'Boston, MA', matched_address: null });
    expect(readStacks(h.deps().stacksPath)['T3'].note).toContain('fallback');
  });

  it('no match for an ordinary postal city: legal_city is "<postal_city>, <state>"', async () => {
    const h = harness(() => miss);
    await runResolve({}, h.deps({ addresses: [makeAddress({ address_id: 'T3b', postal_city: 'Newark', state: 'NJ' })] }));
    expect(readStacks(h.deps().stacksPath)['T3b']).toMatchObject({ method: 'postal_fallback', legal_city: 'Newark, NJ' });
  });

  it('state mismatch is treated as unmatched', async () => {
    const h = harness(() => hit('NY', 'Albany'));
    await runResolve({}, h.deps({ addresses: [makeAddress({ address_id: 'T4', postal_city: 'Newark', state: 'NJ' })] }));
    const stack = readStacks(h.deps().stacksPath)['T4'];
    expect(stack).toMatchObject({ method: 'postal_fallback', legal_city: 'Newark, NJ', county: null });
    expect(h.queries.length).toBeGreaterThan(1);
  });

  it('a cached address is not fetched again, and offline never fetches', async () => {
    const h = harness(() => hit('CA', 'Los Angeles'));
    const addresses = [makeAddress({ address_id: 'T5' })];
    await runResolve({}, h.deps({ addresses }));
    const first = readFileSync(h.deps().stacksPath, 'utf8');
    const calls = h.queries.length;
    await runResolve({}, h.deps({ addresses }));
    await runResolve({ offline: true }, h.deps({ addresses }));
    expect(h.queries.length).toBe(calls);
    expect(readFileSync(h.deps().stacksPath, 'utf8')).toBe(first);

    const fresh = harness(() => hit('CA', 'Los Angeles'));
    const report = await runResolve({ offline: true }, fresh.deps({ addresses }));
    expect(fresh.queries).toHaveLength(0);
    expect(report.unresolved).toEqual(['T5']);
    expect(readStacks(fresh.deps().stacksPath)['T5']).toMatchObject({ method: 'unresolved', legal_city: null });
    expect(existsSync(path.join(fresh.deps().cacheDir!, 'T5.json'))).toBe(false);
  });

  it('no incorporated place: legal_city null with a note', async () => {
    const h = harness(() => hit('CA', null));
    await runResolve({}, h.deps({ addresses: [makeAddress({ address_id: 'T6' })] }));
    const stack = readStacks(h.deps().stacksPath)['T6'];
    expect(stack).toMatchObject({ method: 'geocoder', legal_city: null });
    expect(stack.note).toContain('unincorporated');
  });

  it('retries transient failures with backoff; persistent failure is unresolved and not cached', async () => {
    let n = 0; const sleeps: number[] = [];
    const flaky = (async () => { n++; if (n <= 2) return { ok: false, status: 503, json: async () => ({}) }; return { ok: true, status: 200, json: async () => hit('CA', 'Los Angeles') }; }) as unknown as typeof fetch;
    const h = harness(() => miss);
    await runResolve({}, h.deps({ fetch: flaky, sleep: async ms => { sleeps.push(ms); }, addresses: [makeAddress({ address_id: 'T7' })] }));
    expect(sleeps).toEqual([1000, 2000]);
    expect(readStacks(h.deps().stacksPath)['T7'].method).toBe('geocoder');

    const down = (async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    const h2 = harness(() => miss);
    const report = await runResolve({}, h2.deps({ fetch: down, addresses: [makeAddress({ address_id: 'T8' })] }));
    expect(report.unresolved).toEqual(['T8']);
    expect(existsSync(path.join(h2.deps().cacheDir!, 'T8.json'))).toBe(false);
  });
});

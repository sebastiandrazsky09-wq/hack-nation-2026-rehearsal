// Resolver: address -> JurisdictionStack through the Census Geocoder (no key). Raw responses are cached per address.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Address, JurisdictionStack } from '../contracts';
import { PATHS, ROOT, loadAddresses, readStacks, writeStacks } from '../corpus';
import type { ResolveOptions, ResolveReport, RunResolve } from '../entrypoints';
import { buildVariants } from './variants';

export type GeocodeAttempt = { variant: string; url: string; retrieved_at: string; response: unknown };
export type GeocodeCacheEntry = { address_id: string; attempts: GeocodeAttempt[] };

export type ResolveDeps = {
  fetch?: typeof fetch;
  addresses?: Address[];
  cacheDir?: string;
  stacksPath?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
};

const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const CONCURRENCY = 6;
const RETRIES = 4;
const TIMEOUT_MS = 45_000;
const BACKOFF_MS = 1000;

/** Postal neighbourhood names that are not legal cities. The only place postal names are trusted. */
export const POSTAL_NEIGHBOURHOODS: Record<string, string> = {
  dorchester: 'Boston, MA', roxbury: 'Boston, MA', 'east boston': 'Boston, MA', brighton: 'Boston, MA', allston: 'Boston, MA',
  'south boston': 'Boston, MA', 'jamaica plain': 'Boston, MA', 'hyde park': 'Boston, MA', mattapan: 'Boston, MA',
  'san ysidro': 'San Diego, CA'
};

export function geocodeUrl(query: string): string {
  return `${ENDPOINT}?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`;
}

type Geo = { NAME?: string; BASENAME?: string; STUSAB?: string };
function firstMatch(response: unknown): { matchedAddress: string | null; geographies: Record<string, Geo[]> } | null {
  const match = (response as { result?: { addressMatches?: { matchedAddress?: string; geographies?: Record<string, Geo[]> }[] } })?.result?.addressMatches?.[0];
  if (!match) return null;
  return { matchedAddress: match.matchedAddress ?? null, geographies: match.geographies ?? {} };
}
function matchedState(match: NonNullable<ReturnType<typeof firstMatch>>): string | null {
  const fromGeo = match.geographies['States']?.[0]?.STUSAB;
  if (fromGeo) return fromGeo.toUpperCase();
  return match.matchedAddress?.match(/,\s*([A-Z]{2})\s*,?\s*\d{0,5}\s*$/)?.[1] ?? null;
}
/** A response counts as a match only when the matched state equals the address row state. */
function acceptedMatch(response: unknown, state: string) {
  const match = firstMatch(response);
  if (!match) return null;
  return matchedState(match) === state.toUpperCase() ? match : null;
}

function stackFromEntry(address: Address, entry: GeocodeCacheEntry, rawPath: string): JurisdictionStack {
  for (const attempt of entry.attempts) {
    const match = acceptedMatch(attempt.response, address.state);
    if (!match) continue;
    const place = match.geographies['Incorporated Places']?.[0]?.BASENAME;
    const county = match.geographies['Counties']?.[0]?.NAME ?? null;
    const asGiven = attempt.variant === 'as_given';
    return {
      address_id: address.address_id, state: address.state, county,
      legal_city: place ? `${place}, ${address.state}` : null,
      method: 'geocoder', confidence: asGiven ? 0.95 : 0.85, matched_address: match.matchedAddress, raw_response_path: rawPath,
      note: `Census geocoder match (${attempt.variant})${place ? '' : '; no incorporated place in the response (unincorporated)'}`
    };
  }
  const table = POSTAL_NEIGHBOURHOODS[address.postal_city.trim().toLowerCase()];
  const legal = table && table.endsWith(`, ${address.state}`) ? table : `${address.postal_city.trim()}, ${address.state}`;
  return {
    address_id: address.address_id, state: address.state, county: null, legal_city: legal,
    method: 'postal_fallback', confidence: 0.5, matched_address: null, raw_response_path: rawPath,
    note: `Postal fallback: the geocoder matched none of ${entry.attempts.length} address variants in ${address.state}; legal city from ${table && legal === table ? 'the postal neighbourhood table' : 'the postal city name'}.`
  };
}

function unresolvedStack(address: Address, note: string): JurisdictionStack {
  return { address_id: address.address_id, state: address.state, county: null, legal_city: null, method: 'unresolved', confidence: 0, matched_address: null, raw_response_path: null, note };
}

async function fetchJson(url: string, deps: Required<Pick<ResolveDeps, 'fetch' | 'sleep'>>): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await deps.sleep(BACKOFF_MS * 2 ** (attempt - 1));
    try {
      const res = await deps.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 || res.status >= 500) { last = new Error(`HTTP ${res.status}`); continue; }
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      return await res.json();
    } catch (error) {
      if ((error as { fatal?: boolean }).fatal) throw error;
      last = error;
    }
  }
  throw new Error(`Geocoder request failed after ${RETRIES + 1} attempts: ${last instanceof Error ? last.message : String(last)}`);
}

export const runResolve = (async (options: ResolveOptions, deps: ResolveDeps = {}): Promise<ResolveReport> => {
  const cacheDir = deps.cacheDir ?? PATHS.geocodeCache;
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => new Date().toISOString());
  const addresses = (deps.addresses ?? loadAddresses()).filter(a => !options.ids || options.ids.includes(a.address_id));
  mkdirSync(cacheDir, { recursive: true });

  async function resolveOne(address: Address): Promise<JurisdictionStack> {
    const file = path.join(cacheDir, `${address.address_id}.json`);
    const rawPath = path.relative(ROOT, file);
    if (existsSync(file)) return stackFromEntry(address, JSON.parse(readFileSync(file, 'utf8')) as GeocodeCacheEntry, rawPath);
    if (options.offline) return unresolvedStack(address, 'Offline: no cached geocoder response for this address.');
    const entry: GeocodeCacheEntry = { address_id: address.address_id, attempts: [] };
    try {
      for (const { variant, query } of buildVariants(address)) {
        const url = geocodeUrl(query);
        const response = await fetchJson(url, { fetch: doFetch, sleep });
        entry.attempts.push({ variant, url, retrieved_at: now(), response });
        if (acceptedMatch(response, address.state)) break;
      }
    } catch (error) {
      return unresolvedStack(address, error instanceof Error ? error.message : String(error));
    }
    writeFileSync(file, JSON.stringify(entry, null, 1) + '\n');
    return stackFromEntry(address, entry, rawPath);
  }

  const resolved: JurisdictionStack[] = new Array(addresses.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, addresses.length) }, async () => {
    while (next < addresses.length) { const i = next++; resolved[i] = await resolveOne(addresses[i]); }
  }));

  const stacksPath = deps.stacksPath ?? PATHS.stacks;
  const stacks = readStacks(stacksPath);
  for (const stack of resolved) stacks[stack.address_id] = stack;
  writeStacks(stacks, stacksPath);

  const by_method: Record<string, number> = {};
  for (const stack of resolved) by_method[stack.method] = (by_method[stack.method] ?? 0) + 1;
  return { total: resolved.length, by_method, unresolved: resolved.filter(s => s.method === 'unresolved').map(s => s.address_id).sort() };
}) satisfies RunResolve;

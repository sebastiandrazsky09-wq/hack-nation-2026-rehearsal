// Pure helpers for the Portfolio screen. Everything shown is derived from the batch response; nothing here decides a result.
import { ACTIONS, DECISION_PRECEDENCE, type ActionName, type CheckBatchResponse, type Decision } from '../../gate/contract';
import { isIsoDate, shortDate, streetCase } from '../labels';

export type Row = CheckBatchResponse['results'][number];
export type ChangePoint = CheckBatchResponse['change_points'][number];
export type Counts = Record<Decision, number>;

export const ORDER: readonly Decision[] = DECISION_PRECEDENCE;
export const NO_CITY = 'City not resolved';
export const MAX_POINTS = 8;
export const TABLE_PAGE = 50;

/** The URL key each parameter travels under, on this screen and on the Check screen. */
export const URL_KEY = { amount_months_rent: 'amount', fee_usd: 'fee' } as const;

export const emptyCounts = (): Counts => ({ BLOCK: 0, REVIEW: 0, REQUIRE: 0, PASS: 0 });
export const cityName = (row: Row) => row.legal_city ?? NO_CITY;
export const streetOf = (row: Row) => streetCase(row.street_address);
export const cellName = (row: Row) => `${streetOf(row)}, ${cityName(row)}: ${row.decision}`;

/** A key for one request: what changed between two responses is what differs here. */
export type RequestKey = { action: ActionName; asOf: string; param: string };

export function validateDate(asOf: string): string | null {
  return isIsoDate(asOf) ? null : 'Enter the date as year-month-day, for example 2026-10-01.';
}

export function validateParam(action: ActionName, text: string): string | null {
  const p = ACTIONS[action].parameter;
  if (!p) return null;
  if (text.trim() === '') return `Enter ${p.label.toLowerCase()} in ${p.unit}.`;
  const n = Number(text);
  if (!Number.isFinite(n)) return `${p.label} must be a number of ${p.unit}.`;
  if (p.min_exclusive ? n <= p.min : n < p.min) return `${p.label} must be ${p.min_exclusive ? 'more than' : 'at least'} ${p.min} ${p.unit}.`;
  if (n > p.max) return `${p.label} must be at most ${p.max} ${p.unit}.`;
  return null;
}

export const formatParam = (action: ActionName, text: string) => (ACTIONS[action].parameter?.name === 'fee_usd' ? `$${text}` : `${text} months of rent`);

/** A link to the Check screen with this property, action and date. */
export function propertyLink(id: string, key: RequestKey): string {
  const q = new URLSearchParams({ action: key.action, property: id, as_of: key.asOf });
  const p = ACTIONS[key.action].parameter;
  if (p) q.set(URL_KEY[p.name], key.param);
  return `/?${q.toString()}`;
}

export function screenUrl(key: RequestKey): string {
  const q = new URLSearchParams({ action: key.action, as_of: key.asOf });
  const p = ACTIONS[key.action].parameter;
  if (p) q.set(URL_KEY[p.name], key.param);
  return `/portfolio?${q.toString()}`;
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en');
/** Unresolved cities sort last in either direction. */
const byCity = (a: Row, b: Row) => (a.legal_city === b.legal_city ? 0 : a.legal_city === null ? 1 : b.legal_city === null ? -1 : byText(a.legal_city, b.legal_city));
const byDecision = (a: Row, b: Row) => ORDER.indexOf(a.decision) - ORDER.indexOf(b.decision);
/** The default order: decision, then city, then street. */
export const compareDefault = (a: Row, b: Row) => byDecision(a, b) || byCity(a, b) || byText(a.street_address, b.street_address);

export type SortKey = 'property' | 'city' | 'decision' | 'reason';
export type SortDir = 'asc' | 'desc';

export function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === 'asc' ? 1 : -1;
  const primary = (a: Row, b: Row): number => {
    switch (key) {
      case 'property': return byText(a.street_address, b.street_address) * sign;
      // An unresolved city stays last whichever way the column runs.
      case 'city': return (a.legal_city === null || b.legal_city === null ? 1 : sign) * byCity(a, b);
      case 'decision': return byDecision(a, b) * sign;
      case 'reason': return byText(a.top_reason, b.top_reason) * sign;
    }
  };
  return [...rows].sort((a, b) => primary(a, b) || compareDefault(a, b));
}

export type CityGroup = { city: string | null; name: string; rows: Row[]; counts: Counts };
/** Groups in alphabetical order, the unresolved group last. Rows keep response order inside a group. */
export function groupByCity(rows: Row[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const row of rows) {
    const name = cityName(row);
    let group = groups.get(name);
    if (!group) { group = { city: row.legal_city, name, rows: [], counts: emptyCounts() }; groups.set(name, group); }
    group.rows.push(row);
    group.counts[row.decision] += 1;
  }
  return [...groups.values()].sort((a, b) => (a.city === b.city ? 0 : a.city === null ? 1 : b.city === null ? -1 : byText(a.city, b.city)));
}

/** "3 block, 10 review, 1 require, 12 pass", leaving out what is zero. */
export const countWords = (counts: Counts) => ORDER.filter(d => counts[d] > 0).map(d => `${counts[d]} ${d.toLowerCase()}`).join(', ') || 'none';

/** Ids present in both responses whose decision differs. */
export function changedIds(before: Row[], after: Row[]): string[] {
  const was = new Map(before.map(r => [r.id, r.decision]));
  return after.filter(r => was.has(r.id) && was.get(r.id) !== r.decision).map(r => r.id);
}

/** The eight change points nearest the date, in date order; all of them when asked. */
export function visiblePoints(points: ChangePoint[], asOf: string, showAll: boolean): ChangePoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (showAll || sorted.length <= MAX_POINTS) return sorted;
  const at = Date.parse(`${asOf}T00:00:00Z`);
  const distance = (p: ChangePoint) => Math.abs(Date.parse(`${p.date}T00:00:00Z`) - at);
  return sorted.map((p, i) => ({ p, i })).sort((a, b) => distance(a.p) - distance(b.p) || a.i - b.i).slice(0, MAX_POINTS).sort((a, b) => a.i - b.i).map(x => x.p);
}

/** "{short date}: {label}". The API's own label often opens with the same date; it is not written twice. */
export function pointLabel(p: ChangePoint): string {
  const date = shortDate(p.date);
  const bare = p.label.startsWith(`${date}: `) ? p.label.slice(date.length + 2) : p.label;
  return `${date}: ${bare}`;
}

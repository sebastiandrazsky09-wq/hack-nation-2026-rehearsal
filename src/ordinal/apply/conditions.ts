// Three-valued condition evaluation. Pure: the query date is always an argument.
import type { Address, Condition } from '../contracts';
import { dateCeil, dateFloor } from '../status';

/** true, false, or null for unknown. */
export type Tri = boolean | null;
export type UnknownKind = 'missing' | 'ambiguous' | 'unavailable';
export type Evaluated = { value: Tri; text: string; kind?: UnknownKind; fact?: string };

type Op = 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
type Interval<T> = readonly [T, T];

/** Compare an interval fact with an interval threshold; null when the answer depends on where in the interval the fact lies. */
function compare<T extends string | number>(op: Op, a: Interval<T>, b: Interval<T>): Tri {
  const [a1, a2] = a; const [b1, b2] = b;
  switch (op) {
    case 'lt': return a2 < b1 ? true : a1 >= b2 ? false : null;
    case 'lte': return a2 <= b1 ? true : a1 > b2 ? false : null;
    case 'gt': return a1 > b2 ? true : a2 <= b1 ? false : null;
    case 'gte': return a1 >= b2 ? true : a2 < b1 ? false : null;
    case 'eq': return a1 === a2 && b1 === b2 && a1 === b1 ? true : a2 < b1 || a1 > b2 ? false : null;
  }
}

const REVERSE: Record<Op, Op> = { lt: 'gt', lte: 'gte', gt: 'lt', gte: 'lte', eq: 'eq' };
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
/** `iso` minus whole months, day clamped to the target month's length. */
function minusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12); const month = (total % 12) + 1;
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

function unknown(c: Condition, kind: UnknownKind, fact?: string): Evaluated { return { value: null, text: c.text, kind, fact }; }

/** Evaluate one non-caveat condition for an address on a query date. */
export function evaluateCondition(c: Exclude<Condition, { fact: 'caveat' }>, address: Pick<Address, 'year_built' | 'units'>, asOf: string): Evaluated {
  switch (c.fact) {
    case 'unavailable':
      return unknown(c, 'unavailable', c.name);
    case 'units': {
      if (address.units === null) return unknown(c, 'missing', 'units');
      return { value: compare(c.op, [address.units, address.units], [c.value, c.value]), text: c.text };
    }
    case 'year_built': {
      if (address.year_built === null) return unknown(c, 'missing', 'year_built');
      const fact: Interval<string> = [`${pad(address.year_built, 4)}-01-01`, `${pad(address.year_built, 4)}-12-31`];
      // "on or before 1979" runs to the end of the period; "before 1979" stops at its start.
      const edge = c.op === 'lte' || c.op === 'gt' ? dateCeil(c.date) : dateFloor(c.date);
      const threshold: Interval<string> = c.op === 'eq' ? [dateFloor(c.date), dateCeil(c.date)] : [edge, edge];
      const value = compare(c.op, fact, threshold);
      return value === null ? unknown(c, 'ambiguous') : { value, text: c.text };
    }
    case 'building_age_years': {
      if (address.year_built === null) return unknown(c, 'missing', 'year_built');
      // age op N  <=>  built-date (reverse op) the date N years before the query date.
      const cutoff = minusMonths(asOf, Math.round(c.years * 12));
      const fact: Interval<string> = [`${pad(address.year_built, 4)}-01-01`, `${pad(address.year_built, 4)}-12-31`];
      const value = compare(REVERSE[c.op], fact, [cutoff, cutoff]);
      return value === null ? unknown(c, 'ambiguous') : { value, text: c.text };
    }
  }
}

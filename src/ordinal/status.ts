// FROZEN CONTRACT. Lead-owned. The only place a rule's status for a query date is derived.
import type { InternalRule, OfficialStatus } from './contracts';

/** Earliest day a partial date can mean: '2027' -> '2027-01-01', '2027-07' -> '2027-07-01'. */
export function dateFloor(partial: string): string {
  const [y, m, d] = partial.split('-');
  return `${y}-${m ?? '01'}-${d ?? '01'}`;
}
/** Latest day a partial date can mean: '2027' -> '2027-12-31', '2027-07' -> '2027-07-31'. */
export function dateCeil(partial: string): string {
  const [y, m, d] = partial.split('-');
  if (d) return partial;
  if (!m) return `${y}-12-31`;
  const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return `${y}-${m}-${String(last).padStart(2, '0')}`;
}
export function assertIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) throw new Error(`Query date must be YYYY-MM-DD, got: ${value}`);
  return value;
}

type Dated = Pick<InternalRule, 'legal_status' | 'effective_date' | 'repeal_date'>;
/**
 * Status of a rule on a query date. ISO dates compare lexicographically.
 * - failed and pending never become in force, whatever their dates say.
 * - enacted with an effective date after the query date is not_yet_effective. A partial effective date
 *   (year or month only) counts as effective from its first day.
 * - enacted with no effective date is in force.
 * - repealed on or before the query date is reported as failed (no longer law); the official enum has no 'repealed'.
 */
export function deriveStatus(rule: Dated, asOf: string): OfficialStatus {
  assertIsoDate(asOf);
  if (rule.legal_status === 'failed') return 'failed';
  if (rule.legal_status === 'pending') return 'pending';
  if (rule.repeal_date && dateFloor(rule.repeal_date) <= asOf) return 'failed';
  if (rule.effective_date && dateFloor(rule.effective_date) > asOf) return 'not_yet_effective';
  return 'in_force';
}

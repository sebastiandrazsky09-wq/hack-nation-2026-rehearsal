// Plain-language labels for values the API returns. Display only: nothing here decides a result or status.
export const CATEGORY_LABELS: Record<string, string> = {
  rent_increase_limits: 'Rent increase limits',
  just_cause_eviction: 'Just-cause eviction',
  security_deposits: 'Security deposits',
  application_screening_fees: 'Application and screening fees',
  screening_restrictions: 'Screening restrictions',
  algorithmic_rent_setting: 'Algorithmic rent-setting'
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
export const RESULT_LABELS: Record<string, string> = {
  applies: 'Applies', unknown: 'Unknown', superseded: 'Superseded', not_yet_effective: 'Not yet effective', pending: 'Pending',
  not_applicable: 'Does not reach'
};
export const RESULT_ORDER = ['applies', 'unknown', 'superseded', 'not_yet_effective', 'pending'];
/** What each answer means, in one line. Used in the legend and as the title of each signal. */
export const RESULT_MEANINGS: Record<string, string> = {
  applies: 'In force and covers this address',
  unknown: 'Coverage depends on a fact the data does not hold',
  superseded: 'Covers this address, but another rule governs',
  not_yet_effective: 'Enacted, but it starts after this date',
  pending: 'A bill or proposal, not law'
};
export const STATUS_LABELS: Record<string, string> = {
  in_force: 'In force', not_yet_effective: 'Not yet effective', pending: 'Pending', failed: 'Failed'
};
export const ORIGIN_LABELS: Record<string, string> = {
  official_captured: 'Supplied corpus', supplemental: 'Team-captured page', ingested: 'Added document'
};
export const METHOD_LABELS: Record<string, string> = {
  geocoder: 'matched by the Census geocoder',
  pip: 'matched by map position',
  postal_fallback: 'postal fallback: the mailing city was used because no geocoder match was found',
  unresolved: 'could not be resolved'
};
export const VERIFICATION_LABELS: Record<string, string> = {
  exact: 'found word for word in the source',
  normalized: 'found word for word in the source, spacing and quote marks aside',
  repaired: 'found word for word in the source after one correction',
  failed: 'not found in the source'
};
export const DEFAULT_AS_OF = '2026-10-01';
export function confidenceWords(c: number): string {
  return `${c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low'} (${c.toFixed(2)})`;
}
export const FACT_LABELS: Record<string, string> = {
  year_built: 'year built', units: 'number of units', legal_city: 'legal city',
  owner_occupied: 'whether the owner lives there', owner_type: 'who owns it'
};
export function factName(name: string): string {
  return FACT_LABELS[name] ?? name.replace(/_/g, ' ');
}
export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/_/g, ' ');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '2026-10-01' -> '1 October 2026'; a year or year-month is written as far as it goes. Fixed wording, no locale. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] ?? m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}
/** '2026-10-01' -> '1 Oct 2026'. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!m) return y;
  const month = (MONTHS[Number(m) - 1] ?? m).slice(0, 3);
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}
export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

const KEEP_UPPER = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'PO']);
/** Assessor files shout ("1031-1035 CLINTON ST"); show the street as a person would write it. Display only. */
export function streetCase(street: string): string {
  if (street !== street.toUpperCase()) return street;
  return street.toLowerCase().split(' ').map(word => {
    const upper = word.toUpperCase();
    if (KEEP_UPPER.has(upper)) return upper;
    return word.replace(/^[a-z]/, c => c.toUpperCase());
  }).join(' ');
}

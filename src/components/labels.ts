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
  applies: 'Applies', unknown: 'Unknown', superseded: 'Superseded', not_yet_effective: 'Not yet effective', pending: 'Pending'
};
export const RESULT_ORDER = ['applies', 'unknown', 'superseded', 'not_yet_effective', 'pending'];
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
export const QUICK_DATES = ['2025-12-31', '2026-01-02', '2026-10-01', '2027-07-02'];
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

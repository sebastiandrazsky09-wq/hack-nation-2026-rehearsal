import type { Address, Condition, InternalRule, JurisdictionStack } from '../../../../src/ordinal/contracts';
import { levelOf } from '../../../../src/ordinal/contracts';

export function makeAddress(over: Partial<Address> = {}): Address {
  return { address_id: 'X1', street_address: '1 TEST ST', postal_city: 'Testville', state: 'CA', zip: '90000', year_built: 2000, units: 10, use_code: '0', use_description: 'x', source_dataset: 'test', retrieved_at: '2026-10-01T00:00Z', ...over };
}
export function makeStack(over: Partial<JurisdictionStack> = {}): JurisdictionStack {
  return { address_id: 'X1', state: 'CA', county: 'Test County', legal_city: 'Los Angeles, CA', method: 'geocoder', confidence: 0.95, matched_address: null, raw_response_path: null, note: null, ...over };
}
export function makeRule(over: Partial<InternalRule> & { jurisdiction: string; team_rule_id: string }): InternalRule {
  return {
    level: levelOf(over.jurisdiction), category: 'rent_increase_limits', title: `Rule ${over.team_rule_id}`, requirement: 'req', key_value: null, penalty: null,
    citation: 'Test Code 1', citation_in_source: true, legal_status: 'enacted', enacted_date: '2020-01-01', effective_date: '2020-01-01', repeal_date: null, status_basis: null,
    coverage: { requires: [], exempt_if: [], summary: null, exemptions_summary: null }, precedence: { relation: 'none_stated', text: null },
    source_doc_id: 'DOC', source_url: 'https://example.test/doc', source_origin: 'official_captured', retrieved_at: null,
    quoted_span: 'a quoted span long enough to pass', span_start: 0, span_end: 10, verified: true, verification_method: 'exact', confidence: 1,
    conflict_flag: false, conflict_note: null, also_supported_by: [], extraction_run_id: 'test', ...over
  };
}
export const units = (op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', value: number): Condition => ({ fact: 'units', op, value, text: `units ${op} ${value}` });
export const builtOn = (op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', date: string): Condition => ({ fact: 'year_built', op, date, basis: 'certificate_of_occupancy', text: `certificate of occupancy ${op} ${date}` });
export const ageYears = (op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', years: number): Condition => ({ fact: 'building_age_years', op, years, basis: 'certificate_of_occupancy', text: `building age ${op} ${years}` });
export const unavailable = (name: string): Condition => ({ fact: 'unavailable', name, text: `${name} text` });
export const caveat = (text: string): Condition => ({ fact: 'caveat', name: 'c', text });

import { describe, it, expect, afterEach } from 'vitest';
import { evaluateCondition } from '../../../../src/ordinal/apply/conditions';
import { POLICY } from '../../../../src/ordinal/policy';

const atMostFour = { fact: 'units' as const, op: 'lte' as const, value: 4, text: 'not more than four dwelling units' };
const bounded = { year_built: null, units: null, units_min: 7, units_max: 30 };
afterEach(() => { POLICY.unitBoundsFromUseDescription = false; });

describe('unit bounds policy', () => {
  it('off: an empty unit count is unknown even when the use description states bounds', () => {
    expect(evaluateCondition(atMostFour, bounded, '2026-10-01')).toMatchObject({ value: null, fact: 'units' });
  });
  it('on: stated bounds settle a condition they decide, and stay unknown when they do not', () => {
    POLICY.unitBoundsFromUseDescription = true;
    expect(evaluateCondition(atMostFour, bounded, '2026-10-01').value).toBe(false);
    expect(evaluateCondition({ ...atMostFour, op: 'gte', value: 5 }, bounded, '2026-10-01').value).toBe(true);
    expect(evaluateCondition({ ...atMostFour, op: 'gte', value: 10 }, bounded, '2026-10-01')).toMatchObject({ value: null, fact: 'units' });
    expect(evaluateCondition({ ...atMostFour, op: 'gte', value: 5 }, { ...bounded, units_min: 5, units_max: null }, '2026-10-01').value).toBe(true);
    expect(evaluateCondition(atMostFour, { year_built: null, units: null, units_min: null, units_max: null }, '2026-10-01').value).toBeNull();
  });
  it('never overrides a real unit count', () => {
    POLICY.unitBoundsFromUseDescription = true;
    expect(evaluateCondition(atMostFour, { year_built: null, units: 3, units_min: 7, units_max: 30 }, '2026-10-01').value).toBe(true);
  });
});

describe('explanations are written for a reader', () => {
  it('names missing facts in words and reports the use-description bounds without using them', async () => {
    const { applyRule } = await import('../../../../src/ordinal/apply/index');
    const none = { requires: [], exempt_if: [[{ fact: 'units' as const, op: 'lte' as const, value: 4, text: 'not more than four dwelling units' }, { fact: 'unavailable' as const, name: 'owner_occupied', text: 'owner-occupied premises' }]], summary: null, exemptions_summary: null };
    const rule = { team_rule_id: 'r', jurisdiction: 'NJ', level: 'state', category: 'screening_restrictions', title: 'Example Act', legal_status: 'enacted', enacted_date: null, effective_date: null, repeal_date: null, coverage: none, precedence: { relation: 'none_stated', text: null }, conflict_flag: false, conflict_note: null } as never as import('../../../../src/ordinal/contracts').InternalRule;
    const address = { address_id: 'A1', street_address: '1 X ST', postal_city: 'Newark', state: 'NJ', zip: '', year_built: null, units: null, units_min: 7, units_max: 30, use_code: 'A', use_description: 'APT 7-30 UNITS', source_dataset: '', retrieved_at: '' };
    const stack = { address_id: 'A1', state: 'NJ', county: null, legal_city: 'Newark, NJ', method: 'geocoder' as const, confidence: 0.95, matched_address: null, raw_response_path: null, note: null };
    const out = applyRule(rule, address, stack, '2026-10-01');
    expect(out.result).toBe('unknown'); expect(out.missing_facts).toEqual(['owner_occupied', 'units']);
    expect(out.explanation).toContain('whether the owner lives there'); expect(out.explanation).toContain('the unit count'); expect(out.explanation).not.toMatch(/owner_occupied|units_min/);
    expect(out.explanation).toContain('indicates 7 to 30 units; that is not treated as a unit count');
  });
});

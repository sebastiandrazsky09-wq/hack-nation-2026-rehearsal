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

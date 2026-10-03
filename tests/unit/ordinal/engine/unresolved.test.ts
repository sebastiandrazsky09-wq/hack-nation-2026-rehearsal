import { describe, expect, it } from 'vitest';
import { applyAddress, REASON_CODES } from '../../../../src/ordinal/apply';
import { makeAddress, makeRule, makeStack } from './helpers';

const AS_OF = '2026-10-01';
const unresolved = (state = 'CA') => makeStack({ state, legal_city: null, method: 'unresolved', confidence: 0 });
const at = (rules: ReturnType<typeof makeRule>[], stack = unresolved()) => Object.fromEntries(applyAddress(rules, makeAddress({ state: stack.state }), stack, AS_OF).map(r => [r.team_rule_id, r]));

describe('unresolved jurisdiction stack', () => {
  const rules = [
    makeRule({ team_rule_id: 'r-state', jurisdiction: 'CA' }),
    makeRule({ team_rule_id: 'r-la', jurisdiction: 'Los Angeles, CA' }),
    makeRule({ team_rule_id: 'r-sd', jurisdiction: 'San Diego, CA', category: 'just_cause_eviction' }),
    makeRule({ team_rule_id: 'r-nj', jurisdiction: 'Newark, NJ' }),
    makeRule({ team_rule_id: 'r-failed', jurisdiction: 'Berkeley, CA', legal_status: 'failed' })
  ];

  it('makes every city rule of the stack state unknown, asks for legal_city, and leaves state rules to evaluate', () => {
    const out = at(rules);
    for (const id of ['r-la', 'r-sd']) expect(out[id]).toMatchObject({ result: 'unknown', reason_code: 'jurisdiction_unresolved', missing_facts: ['legal_city'] });
    // The machine name stays in missing_facts; the explanation says it in words.
    expect(out['r-la'].explanation).toContain('the legal city');
    expect(out['r-state'].result).toBe('applies');
    expect(REASON_CODES).toContain('jurisdiction_unresolved');
  });

  it('keeps another state\'s city rules and failed rules not_applicable', () => {
    const out = at(rules);
    expect(out['r-nj']).toMatchObject({ result: 'not_applicable', reason_code: 'outside_jurisdiction' });
    expect(out['r-failed'].result).toBe('not_applicable');
  });

  it('a resolved stack with no city keeps city rules not_applicable', () => {
    const out = at(rules, makeStack({ legal_city: null, method: 'postal_fallback' }));
    expect(out['r-la'].result).toBe('not_applicable');
  });

  it('a yielding state rule becomes unknown while the local rule is undecided', () => {
    const state = makeRule({ team_rule_id: 'r-state', jurisdiction: 'CA', precedence: { relation: 'yields_to_stricter_local', text: 'x' } });
    const out = at([state, makeRule({ team_rule_id: 'r-la', jurisdiction: 'Los Angeles, CA' })]);
    expect(out['r-state']).toMatchObject({ result: 'unknown', reason_code: 'local_coverage_unknown' });
  });
});

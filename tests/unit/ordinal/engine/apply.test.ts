import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyAddress, applyRule, REASON_CODES } from '../../../../src/ordinal/apply';
import type { CoverageSpec } from '../../../../src/ordinal/contracts';
import { ageYears, builtOn, caveat, makeAddress, makeRule, makeStack, unavailable, units } from './helpers';

const AS_OF = '2026-10-01';
const spec = (requires: CoverageSpec['requires'], exempt_if: CoverageSpec['exempt_if'] = []): CoverageSpec => ({ requires, exempt_if, summary: null, exemptions_summary: null });
const stateRule = (coverage: CoverageSpec = spec([]), over = {}) => makeRule({ team_rule_id: 'r-state', jurisdiction: 'CA', coverage, ...over });
const run = (rule: ReturnType<typeof makeRule>, a = makeAddress(), s = makeStack(), asOf = AS_OF) => applyRule(rule, a, s, asOf);

describe('jurisdiction', () => {
  it('state rule applies to every address in the state and to none outside', () => {
    const rule = stateRule();
    for (const city of ['Los Angeles, CA', 'San Diego, CA', null]) expect(run(rule, makeAddress(), makeStack({ legal_city: city })).result).toBe('applies');
    const out = run(rule, makeAddress({ state: 'NJ' }), makeStack({ state: 'NJ', legal_city: 'Newark, NJ' }));
    expect(out).toMatchObject({ result: 'not_applicable', reason_code: 'outside_jurisdiction' });
  });
  it('a city rule applies only where legal_city equals its jurisdiction', () => {
    const rule = makeRule({ team_rule_id: 'r-hob', jurisdiction: 'Hoboken, NJ' });
    const nj = (legal_city: string | null) => makeStack({ state: 'NJ', legal_city });
    expect(run(rule, makeAddress(), nj('Hoboken, NJ')).result).toBe('applies');
    for (const city of ['Jersey City, NJ', 'Newark, NJ', null]) expect(run(rule, makeAddress(), nj(city)).result).toBe('not_applicable');
  });
});

describe('conditions', () => {
  const cutoff = stateRule(spec([builtOn('lte', '1979-06-13')]));
  it('year cutoff is an interval: 1978 applies, 1980 not, 1979 unknown, missing unknown', () => {
    expect(run(cutoff, makeAddress({ year_built: 1978 })).result).toBe('applies');
    expect(run(cutoff, makeAddress({ year_built: 1980 })).result).toBe('not_applicable');
    const straddle = run(cutoff, makeAddress({ year_built: 1979 }));
    expect(straddle).toMatchObject({ result: 'unknown', reason_code: 'cutoff_ambiguous', missing_facts: [] });
    expect(run(cutoff, makeAddress({ year_built: null }))).toMatchObject({ result: 'unknown', reason_code: 'missing_fact', missing_facts: ['year_built'] });
  });
  it('a year-only threshold: "on or before 1979" includes 1979, "before 1979" excludes it', () => {
    expect(run(stateRule(spec([builtOn('lte', '1979')])), makeAddress({ year_built: 1979 })).result).toBe('applies');
    expect(run(stateRule(spec([builtOn('lt', '1979')])), makeAddress({ year_built: 1979 })).result).toBe('not_applicable');
  });
  it('units >= 5 required', () => {
    const rule = stateRule(spec([units('gte', 5)]));
    expect(run(rule, makeAddress({ units: 32 })).result).toBe('applies');
    expect(run(rule, makeAddress({ units: 3 })).result).toBe('not_applicable');
    expect(run(rule, makeAddress({ units: null }))).toMatchObject({ result: 'unknown', missing_facts: ['units'] });
  });
  it('exemption group [units <= 2, unavailable owner_occupied]', () => {
    const rule = stateRule(spec([], [[units('lte', 2), unavailable('owner_occupied')]]));
    expect(run(rule, makeAddress({ units: 32 })).result).toBe('applies');
    expect(run(rule, makeAddress({ units: 2 }))).toMatchObject({ result: 'unknown', missing_facts: ['owner_occupied'] });
    expect(run(rule, makeAddress({ units: null }))).toMatchObject({ result: 'unknown', missing_facts: ['owner_occupied', 'units'] });
  });
  it('a group that holds exempts, and exempt wins over unknown requires', () => {
    const rule = stateRule(spec([unavailable('x')], [[units('lte', 2)]]));
    expect(run(rule, makeAddress({ units: 1 }))).toMatchObject({ result: 'not_applicable', reason_code: 'exempt' });
  });
  it('a lone caveat exemption never changes the result and is listed', () => {
    const rule = stateRule(spec([units('gte', 5)], [[caveat('dormitories are exempt')]]));
    const r = run(rule, makeAddress({ units: 32 }));
    expect(r.result).toBe('applies'); expect(r.caveats).toEqual(['dormitories are exempt']); expect(r.explanation).toContain('dormitories are exempt');
    expect(run(stateRule(spec([caveat('c1')])), makeAddress()).result).toBe('applies');
  });
  it('building_age_years < 15 depends on the query date; a straddling year is unknown', () => {
    const rule = stateRule(spec([], [[ageYears('lt', 15)]]));
    const a = makeAddress({ year_built: 2010 });
    expect(run(rule, a, makeStack(), '2024-06-01')).toMatchObject({ result: 'not_applicable', reason_code: 'exempt' });
    expect(run(rule, a, makeStack(), '2026-10-01').result).toBe('applies');
    expect(run(rule, makeAddress({ year_built: 2011 }), makeStack(), '2026-10-01')).toMatchObject({ result: 'unknown', reason_code: 'cutoff_ambiguous' });
  });
});

describe('status', () => {
  it('effective 2027-07-01: not_yet_effective for every in-state address, applies after', () => {
    const rule = stateRule(spec([]), { effective_date: '2027-07-01' });
    for (const city of ['Los Angeles, CA', null]) expect(run(rule, makeAddress(), makeStack({ legal_city: city }), '2026-10-01').result).toBe('not_yet_effective');
    expect(run(rule, makeAddress(), makeStack(), '2027-07-02').result).toBe('applies');
    const jan = stateRule(spec([]), { effective_date: '2026-01-01' });
    expect(run(jan, makeAddress(), makeStack(), '2025-12-31').result).toBe('not_yet_effective');
    expect(run(jan, makeAddress(), makeStack(), '2026-01-02').result).toBe('applies');
  });
  it('not_yet_effective is withheld where coverage is definitely false, kept where unknown', () => {
    const rule = stateRule(spec([units('gte', 5)]), { effective_date: '2027-07-01' });
    expect(run(rule, makeAddress({ units: 2 })).result).toBe('not_applicable');
    expect(run(rule, makeAddress({ units: null }))).toMatchObject({ result: 'not_yet_effective', missing_facts: ['units'] });
  });
  it('pending is pending at every date; failed is never applies', () => {
    const pending = stateRule(spec([]), { legal_status: 'pending', enacted_date: null, effective_date: '2020-01-01' });
    const failed = stateRule(spec([]), { legal_status: 'failed', enacted_date: null, effective_date: '2020-01-01' });
    for (const d of ['2019-01-01', '2026-10-01', '2040-01-01']) {
      expect(run(pending, makeAddress(), makeStack(), d).result).toBe('pending');
      expect(run(failed, makeAddress(), makeStack(), d)).toMatchObject({ result: 'not_applicable', reason_code: 'status_failed' });
    }
  });
  it('a repealed rule is not applicable on and after the repeal date', () => {
    const rule = stateRule(spec([]), { repeal_date: '2026-01-01' });
    expect(run(rule, makeAddress(), makeStack(), '2025-12-31').result).toBe('applies');
    expect(run(rule, makeAddress(), makeStack(), '2026-01-01').result).toBe('not_applicable');
  });
});

describe('precedence', () => {
  const state = (relation: 'yields_to_stricter_local' | 'preempts_local', over = {}) => stateRule(spec([]), { precedence: { relation, text: 'wording' }, ...over });
  const city = (coverage: CoverageSpec = spec([]), over = {}) => makeRule({ team_rule_id: 'r-city', jurisdiction: 'Los Angeles, CA', coverage, ...over });
  const at = (rules: ReturnType<typeof makeRule>[], a = makeAddress(), s = makeStack()) => Object.fromEntries(applyAddress(rules, a, s, AS_OF).map(r => [r.team_rule_id, r]));

  it('yields_to_stricter_local: superseded / unknown / applies', () => {
    const s = state('yields_to_stricter_local');
    expect(at([s, city()])['r-state']).toMatchObject({ result: 'superseded', reason_code: 'superseded_by_local' });
    expect(at([s, city()])['r-state'].explanation).toContain('Rule r-city');
    expect(at([s, city(spec([unavailable('rent_board_registration')]))], makeAddress())['r-state']).toMatchObject({ result: 'unknown', reason_code: 'local_coverage_unknown' });
    expect(at([s, city()], makeAddress(), makeStack({ legal_city: 'San Diego, CA' }))['r-state'].result).toBe('applies');
    expect(at([s, city()], makeAddress(), makeStack({ legal_city: null }))['r-state'].result).toBe('applies');
  });
  it('a local rule of another category does not supersede', () => {
    expect(at([state('yields_to_stricter_local'), city(spec([]), { category: 'just_cause_eviction' })])['r-state'].result).toBe('applies');
  });
  it('preempts_local: both flagged where both are in play, none elsewhere', () => {
    const s = state('preempts_local', { effective_date: '2027-07-01' });
    const here = at([s, city()]);
    expect(here['r-state']).toMatchObject({ result: 'not_yet_effective', conflict_flag: true });
    expect(here['r-city']).toMatchObject({ result: 'applies', conflict_flag: true });
    expect(here['r-state'].conflict_note).toContain('Rule r-city');
    expect(here['r-city'].conflict_note).toContain('Rule r-state');
    const elsewhere = at([s, city()], makeAddress(), makeStack({ legal_city: 'San Diego, CA' }));
    expect(elsewhere['r-state'].conflict_flag).toBe(false); expect(elsewhere['r-city'].conflict_flag).toBe(false);
  });
  it("a rule's own conflict_flag propagates to non-not_applicable results only", () => {
    const rule = stateRule(spec([]), { conflict_flag: true, conflict_note: 'two effective dates' });
    expect(run(rule)).toMatchObject({ result: 'applies', conflict_flag: false });
    const [inState] = applyAddress([rule], makeAddress(), makeStack(), AS_OF);
    expect(inState).toMatchObject({ conflict_flag: true, conflict_note: 'two effective dates' });
    const [outside] = applyAddress([rule], makeAddress({ state: 'NJ' }), makeStack({ state: 'NJ' }), AS_OF);
    expect(outside.conflict_flag).toBe(false);
  });
});

describe('determinism', () => {
  it('applyAddress is repeatable, sorted by team_rule_id, and returns not_applicable too', () => {
    const rules = ['r-3', 'r-1', 'r-2'].map(id => makeRule({ team_rule_id: id, jurisdiction: id === 'r-2' ? 'NJ' : 'CA' }));
    const a = applyAddress(rules, makeAddress(), makeStack(), AS_OF);
    expect(applyAddress(rules, makeAddress(), makeStack(), AS_OF)).toEqual(a);
    expect(a.map(r => r.team_rule_id)).toEqual(['r-1', 'r-2', 'r-3']);
    expect(a[1].result).toBe('not_applicable');
    expect(rules.map(r => r.team_rule_id)).toEqual(['r-3', 'r-1', 'r-2']);
  });
  it('every reason_code produced is in the exported list', () => {
    expect(REASON_CODES).toContain(run(stateRule()).reason_code);
  });
  it('engine and resolver sources hold no clock/random calls (apply) and no test, rule or address ids', () => {
    const dir = path.join(__dirname, '../../../../src/ordinal');
    const files = (d: string) => readdirSync(path.join(dir, d)).map(f => path.join(dir, d, f));
    for (const f of files('apply')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Date\.now|new Date|Math\.random/);
    for (const f of [...files('apply'), ...files('resolve')]) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bT[1-6]\b|\bA0\d{3}\b|\bD0\d{2}\b/);
  });
});

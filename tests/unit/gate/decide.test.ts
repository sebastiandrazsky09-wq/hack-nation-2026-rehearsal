import { describe, it, expect } from 'vitest';
import { decide, type DecideInput, type DecideRule } from '../../../src/gate/decide';
import { ACTIONS, passSummary, type Constraint } from '../../../src/gate/contract';
import type { ApplyResult } from '../../../src/ordinal/contracts';

const deposit = ACTIONS.collect_security_deposit;
const algo = ACTIONS.set_rent_with_pricing_algorithm;
const ASOF = '2026-10-01';

const result = (over: Partial<ApplyResult> = {}): ApplyResult => ({
  address_id: 'X', team_rule_id: 'R1', result: 'applies', reason_code: 'covered', missing_facts: [], caveats: [], explanation: 'engine explanation', conflict_flag: false, conflict_note: null, ...over
});
const constraint = (over: Partial<Constraint> = {}): Constraint => ({
  constraint_id: 'c1', rule_id: 'R1', action: 'collect_security_deposit', effect: 'limit', parameter: 'amount_months_rent', max: null, value_text: null, hard_max: null, hard_max_text: null,
  elements_untestable: null, obligation_text: null, evidence_quote: 'the constraint sentence', source_doc_id: 'D', span_start: 0, span_end: 10, verification_method: 'exact', value_check: 'parsed', model: 'm', prompt_version: 'p', ...over
});
const rule = (id: string, over: Partial<DecideRule['rule']> = {}): DecideRule['rule'] => ({
  team_rule_id: id, title: `Title ${id}`, jurisdiction: 'NJ', citation: `Cite ${id}`, requirement: `Requirement ${id}`, quoted_span: `rule sentence ${id} long enough`, source_doc_id: 'D', source_url: 'https://example.test/d',
  source_origin: 'official_captured', retrieved_at: '2026-10-01', verification_method: 'exact', effective_date: '2027-07-01', ...over
});
const entry = (id: string, res: Partial<ApplyResult>, constraints: Constraint[] = []): DecideRule => ({ rule: rule(id), result: result({ team_rule_id: id, ...res }), constraints: constraints.map(c => ({ ...c, rule_id: id })) });
const run = (rules: DecideRule[], over: Partial<DecideInput> = {}) => decide({ action: deposit, value: 2, asOf: ASOF, rules, gaps: [], ...over });

describe('decide: engine results that never decide', () => {
  it('no rules at all is PASS with the exact sentence', () => {
    const d = run([]);
    expect(d.decision).toBe('PASS'); expect(d.permit).toBe(true); expect(d.determining).toEqual([]);
    expect(d.summary.startsWith(passSummary(ASOF))).toBe(true);
  });
  it.each(['not_applicable', 'superseded'] as const)('%s is trace only', res => {
    const d = run([entry('R1', { result: res }, [constraint({ effect: 'prohibit' })])]);
    expect(d.decision).toBe('PASS'); expect(d.review).toEqual([]); expect(d.upcoming).toEqual([]);
  });
  it.each(['pending', 'not_yet_effective'] as const)('%s goes to upcoming and never decides', res => {
    const d = run([entry('R1', { result: res }, [constraint({ effect: 'prohibit' })])]);
    expect(d.decision).toBe('PASS');
    expect(d.upcoming).toEqual([{ rule_id: 'R1', title: 'Title R1', status: res, effective_date: '2027-07-01', would_be: 'BLOCK' }]);
    expect(d.summary).toContain('Not yet in force: Title R1');
  });
  it('would_be is null when the upcoming rule has no verified constraint, and follows limits and obligations otherwise', () => {
    const upcoming = (cs: Constraint[]) => run([entry('R1', { result: 'not_yet_effective' }, cs)]).upcoming[0].would_be;
    expect(upcoming([])).toBeNull();
    expect(upcoming([constraint({ max: 3 })])).toBe('PASS');
    expect(upcoming([constraint({ max: 1 })])).toBe('BLOCK');
    expect(upcoming([constraint({ max: null })])).toBe('REVIEW');
    expect(upcoming([constraint({ effect: 'obligation', parameter: null })])).toBe('REQUIRE');
  });
});

describe('decide: unknown engine results', () => {
  it.each([
    ['missing_fact', 'missing_fact'], ['cutoff_ambiguous', 'cutoff_ambiguous'],
    ['unverifiable_condition', 'unverifiable_condition'], ['local_coverage_unknown', 'unverifiable_condition'], ['jurisdiction_unresolved', 'unverifiable_condition']
  ])('reason %s becomes review code %s', (reason, code) => {
    const d = run([entry('R1', { result: 'unknown', reason_code: reason, missing_facts: [] })]);
    expect(d.decision).toBe('REVIEW'); expect(d.permit).toBe(false);
    expect(d.review).toEqual([{ code, rule_id: 'R1', detail: 'engine explanation', missing_facts: [], resolvable_by: [] }]);
    expect(d.determining.map(r => [r.rule_id, r.outcome])).toEqual([['R1', 'unresolved']]);
  });
  it('passes missing facts through and offers only the suppliable ones', () => {
    const d = run([entry('R1', { result: 'unknown', reason_code: 'missing_fact', missing_facts: ['legal_city', 'units'] })]);
    expect(d.review[0].missing_facts).toEqual(['legal_city', 'units']);
    expect(d.review[0].resolvable_by).toEqual(['units']);
  });
});

describe('decide: applying rules', () => {
  it('prohibit with nothing untestable blocks', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'prohibit', parameter: null })])], { action: algo, value: null });
    expect(d.decision).toBe('BLOCK'); expect(d.permit).toBe(false);
    expect(d.determining).toMatchObject([{ rule_id: 'R1', effect: 'prohibit', outcome: 'violated', conflict_note: null }]);
  });
  it('prohibit with untestable elements is REVIEW conditional_prohibition quoting them', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'prohibit', parameter: null, elements_untestable: 'an agreement between landlords' })])], { action: algo, value: null });
    expect(d.decision).toBe('REVIEW');
    expect(d.review[0]).toMatchObject({ code: 'conditional_prohibition', rule_id: 'R1' });
    expect(d.review[0].detail).toContain('an agreement between landlords');
  });
  it('an obligation is REQUIRE with an obligations entry, and it permits', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'obligation', parameter: null, obligation_text: 'Hold the deposit in a separate account.' })])]);
    expect(d.decision).toBe('REQUIRE'); expect(d.permit).toBe(true);
    expect(d.obligations).toEqual([{ rule_id: 'R1', citation: 'Cite R1', text: 'Hold the deposit in a separate account.', evidence_quote: 'the constraint sentence' }]);
    expect(d.determining).toMatchObject([{ outcome: 'obligation' }]);
  });
  it('effect none is trace only', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'none', parameter: null })])]);
    expect(d.decision).toBe('PASS'); expect(d.determining).toEqual([]); expect(d.review).toEqual([]);
  });
  it('an applying rule with no verified constraint is REVIEW constraint_not_modeled with the requirement as detail', () => {
    const d = run([entry('R1', {})]);
    expect(d.decision).toBe('REVIEW');
    expect(d.review).toEqual([{ code: 'constraint_not_modeled', rule_id: 'R1', detail: 'Requirement R1', missing_facts: [], resolvable_by: [] }]);
  });
});

describe('decide: limit with max and hard_max in all four combinations', () => {
  const limit = (max: number | null, hard: number | null, x: number) =>
    run([entry('R1', {}, [constraint({ max, hard_max: hard, value_text: 'two months', hard_max_text: 'at most three months' })])], { value: x });
  it('neither: never computable', () => {
    const d = limit(null, null, 2);
    expect(d.decision).toBe('REVIEW'); expect(d.review[0].code).toBe('limit_not_computable');
  });
  it('max only: at or under is satisfied, over is violated', () => {
    expect(limit(2, null, 2).decision).toBe('PASS');
    expect(limit(2, null, 2).determining).toMatchObject([{ outcome: 'satisfied' }]);
    expect(limit(2, null, 2.5).decision).toBe('BLOCK');
  });
  it('hard_max only: over it is violated, otherwise not computable', () => {
    expect(limit(null, 3, 3.5).decision).toBe('BLOCK');
    expect(limit(null, 3, 3).decision).toBe('REVIEW');
    expect(limit(null, 3, 1).review[0].code).toBe('limit_not_computable');
  });
  it('both: under max satisfied, between is review, over hard_max violated', () => {
    expect(limit(1.5, 3, 1).decision).toBe('PASS');
    expect(limit(1.5, 3, 1.5).decision).toBe('PASS');
    expect(limit(1.5, 3, 2).decision).toBe('REVIEW');
    expect(limit(1.5, 3, 3).decision).toBe('REVIEW');
    expect(limit(1.5, 3, 3.01).decision).toBe('BLOCK');
  });
  it('a limit with no request value is not computable', () => {
    expect(run([entry('R1', {}, [constraint({ max: 2 })])], { value: null }).decision).toBe('REVIEW');
  });
});

describe('decide: aggregation', () => {
  const blocker = () => entry('R1', {}, [constraint({ effect: 'prohibit', parameter: null })]);
  const unknown = () => entry('R2', { result: 'unknown', reason_code: 'missing_fact', missing_facts: ['units'] });
  const duty = () => entry('R3', {}, [constraint({ effect: 'obligation', parameter: null })]);
  const satisfied = () => entry('R4', {}, [constraint({ max: 3 })]);

  it('BLOCK beats REVIEW, and determining holds only the violated rule', () => {
    const d = run([blocker(), unknown()]);
    expect(d.decision).toBe('BLOCK');
    expect(d.determining.map(r => r.rule_id)).toEqual(['R1']);
    expect(d.review.map(r => r.rule_id)).toEqual(['R2']);
  });
  it('REVIEW beats REQUIRE, and determining holds the unresolved rule', () => {
    const d = run([duty(), unknown()]);
    expect(d.decision).toBe('REVIEW');
    expect(d.determining.map(r => r.rule_id)).toEqual(['R2']);
    expect(d.obligations).toHaveLength(1);
  });
  it('REQUIRE beats PASS and lists only the obligation rules', () => {
    const d = run([satisfied(), duty()]);
    expect(d.decision).toBe('REQUIRE');
    expect(d.determining.map(r => r.rule_id)).toEqual(['R3']);
  });
  it('PASS lists the satisfied limits', () => {
    const d = run([satisfied()]);
    expect(d.decision).toBe('PASS');
    expect(d.determining.map(r => [r.rule_id, r.outcome])).toEqual([['R4', 'satisfied']]);
  });
  it('evidence has the rule quote once and each deciding constraint quote', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'prohibit', parameter: null, evidence_quote: 'q one' }), constraint({ constraint_id: 'c2', max: 1, evidence_quote: 'q two' })])], { value: 5 });
    expect(d.decision).toBe('BLOCK');
    expect(d.evidence.map(e => [e.kind, e.quoted_span])).toEqual([['rule', 'rule sentence R1 long enough'], ['constraint', 'q one'], ['constraint', 'q two']]);
    expect(d.evidence.every(e => e.source_url === 'https://example.test/d' && e.source_origin === 'official_captured')).toBe(true);
  });
  it('summary never says legal or compliant, in any decision', () => {
    for (const rules of [[], [blocker()], [unknown()], [duty()], [satisfied()]]) {
      expect(run(rules, { gaps: ['Jersey City, NJ: no readable source.'] }).summary).not.toMatch(/legal|compliant/i);
    }
  });
});

describe('decide: conflicts', () => {
  it('a conflict on a blocking rule stays BLOCK and carries the note on the determining row', () => {
    const d = run([entry('R1', { conflict_flag: true, conflict_note: 'Possible preemption.' }, [constraint({ effect: 'prohibit', parameter: null })])]);
    expect(d.decision).toBe('BLOCK');
    expect(d.determining[0].conflict_note).toBe('Possible preemption.');
    expect(d.review.some(r => r.code === 'conflict')).toBe(false);
  });
  it('a conflict on a rule that did not block adds a conflict review item', () => {
    const d = run([entry('R1', { conflict_flag: true, conflict_note: 'Possible preemption.' }, [constraint({ max: 3 })])]);
    expect(d.decision).toBe('REVIEW');
    expect(d.review).toEqual([{ code: 'conflict', rule_id: 'R1', detail: 'Possible preemption.', missing_facts: [], resolvable_by: [] }]);
  });
  it('a conflict flag on a rule that does not apply is ignored', () => {
    expect(run([entry('R1', { result: 'not_yet_effective', conflict_flag: true, conflict_note: 'x' }, [constraint({ max: 3 })])]).decision).toBe('PASS');
  });
});

describe('decide: known gaps', () => {
  const gap = 'Jersey City, NJ: no readable source for algorithmic rent setting.';
  it('a gap alone is REVIEW coverage_gap, never PASS', () => {
    const d = run([], { gaps: [gap] });
    expect(d.decision).toBe('REVIEW'); expect(d.permit).toBe(false);
    expect(d.review).toEqual([{ code: 'coverage_gap', rule_id: null, detail: gap, missing_facts: [], resolvable_by: [] }]);
    expect(d.determining).toEqual([]);
    expect(d.summary).toContain(gap);
  });
  it('a gap turns what would be REQUIRE or PASS into REVIEW', () => {
    expect(run([entry('R1', {}, [constraint({ effect: 'obligation', parameter: null })])], { gaps: [gap] }).decision).toBe('REVIEW');
    expect(run([entry('R1', {}, [constraint({ max: 3 })])], { gaps: [gap] }).decision).toBe('REVIEW');
  });
  it('BLOCK still outranks a gap', () => {
    const d = run([entry('R1', {}, [constraint({ effect: 'prohibit', parameter: null })])], { gaps: [gap] });
    expect(d.decision).toBe('BLOCK'); expect(d.review.map(r => r.code)).toEqual(['coverage_gap']);
  });
});

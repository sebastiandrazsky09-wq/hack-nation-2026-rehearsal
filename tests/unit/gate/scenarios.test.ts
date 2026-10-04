import { describe, it, expect } from 'vitest';
import { check, checkBatch, type GateData } from '../../../src/gate';
import { ACTIONS, ACTION_NAMES, CheckBatchResponseSchema, CheckResponseSchema, type ActionName, type CheckRequest } from '../../../src/gate/contract';
import { GateError } from '../../../src/gate/http';
import { gateData } from '../../../src/server/gate';
import { DISCLAIMER } from '../../../src/server/ordinal';

const data: GateData = gateData();
const ASOF = '2026-10-01';

const request = (id: string, action: ActionName, over: { as_of?: string; facts?: { units?: number; year_built?: number } } = {}): CheckRequest => {
  const parameter = ACTIONS[action].parameter;
  return {
    subject: { type: 'property_manager' },
    action: { name: action, ...(parameter ? { properties: { [parameter.name]: parameter.example } } : {}) },
    resource: { type: 'property', id },
    context: { as_of: over.as_of ?? ASOF, ...(over.facts ? { facts: over.facts } : {}) }
  };
};
const cityOf = (id: string) => data.stacks[id].legal_city;
const inCity = (city: string) => data.addresses.filter(a => cityOf(a.address_id) === city);
const trace = (r: ReturnType<typeof check>) => new Map(r.trace.map(t => [t.rule_id, t.result]));
const algo = 'set_rent_with_pricing_algorithm' as const;

describe('real store: algorithmic rent setting', () => {
  const sf = inCity('San Francisco, CA')[0];
  const newark = inCity('Newark, NJ')[0];

  it('San Francisco: two rules apply on 2026-10-01, and the state rule is not yet effective on 2025-12-31', () => {
    expect(sf).toBeDefined();
    const now = check(request(sf.address_id, algo), data);
    const applying = now.trace.filter(t => t.result === 'applies');
    expect(applying).toHaveLength(2);
    expect(new Set(now.trace.filter(t => t.result === 'applies').map(t => t.rule_id)).size).toBe(2);
    const before = check(request(sf.address_id, algo, { as_of: '2025-12-31' }), data);
    const stateRules = data.rules.filter(r => r.category === 'algorithmic_rent_setting' && r.jurisdiction === 'CA').map(r => r.team_rule_id);
    expect(before.upcoming.filter(u => stateRules.includes(u.rule_id)).map(u => u.status)).toContain('not_yet_effective');
    expect(before.upcoming.every(u => trace(before).get(u.rule_id) === u.status)).toBe(true);
  });

  it('Newark: the state act is pending, then not yet effective, then applies', () => {
    expect(newark).toBeDefined();
    const stateAct = data.rules.find(r => r.category === 'algorithmic_rent_setting' && r.jurisdiction === 'NJ' && r.legal_status === 'enacted')!;
    expect(stateAct).toBeDefined();
    const at = (as_of: string) => trace(check(request(newark.address_id, algo, { as_of }), data)).get(stateAct.team_rule_id);
    expect(at('2025-12-31')).toBe('pending');
    expect(at('2026-10-01')).toBe('not_yet_effective');
    expect(at('2027-07-02')).toBe('applies');
    const upcoming = check(request(newark.address_id, algo, { as_of: '2026-10-01' }), data).upcoming;
    expect(upcoming.find(u => u.rule_id === stateAct.team_rule_id)?.status).toBe('not_yet_effective');
  });

  it('Jersey City: REVIEW with a coverage_gap item, never PASS', () => {
    const jc = inCity('Jersey City, NJ')[0];
    expect(jc).toBeDefined();
    const r = check(request(jc.address_id, algo), data);
    expect(r.decision).toBe('REVIEW'); expect(r.permit).toBe(false);
    expect(r.review.some(i => i.code === 'coverage_gap')).toBe(true);
    expect(r.coverage.known_gaps.length).toBeGreaterThan(0);
  });

  it('batch over all properties: evaluated equals the registry and counts sum to it; BLOCK+REVIEW never decreases as laws come into force', () => {
    const body = (as_of: string) => ({ subject: { type: 'property_manager' as const }, action: { name: algo }, resources: 'all' as const, context: { as_of } });
    const runs = ['2025-12-31', '2026-01-02', '2027-07-02'].map(d => checkBatch(body(d), data));
    for (const run of runs) {
      CheckBatchResponseSchema.parse(run);
      expect(run.evaluated).toBe(data.addresses.length);
      expect(run.results.map(r => r.id)).toEqual(data.addresses.map(a => a.address_id));
      expect(run.counts.PASS + run.counts.BLOCK + run.counts.REQUIRE + run.counts.REVIEW).toBe(run.evaluated);
      expect(run.disclaimer).toBe(DISCLAIMER);
    }
    const restricted = runs.map(r => r.counts.BLOCK + r.counts.REVIEW);
    expect(restricted[1]).toBeGreaterThanOrEqual(restricted[0]);
    expect(restricted[2]).toBeGreaterThanOrEqual(restricted[1]);
  });

  it('a full batch of every registry property finishes well inside a request budget for each action', () => {
    const runs = ACTION_NAMES.map(name => {
      const parameter = ACTIONS[name].parameter;
      return checkBatch({ subject: { type: 'owner' }, action: { name, ...(parameter ? { properties: { [parameter.name]: parameter.example } } : {}) }, resources: 'all' }, data);
    });
    for (const run of runs) expect(run.evaluated_ms).toBeLessThan(5000);
  });

  it('batch: given ids keep their order, and an unknown id is a 404 naming it', () => {
    const ids = [data.addresses[3].address_id, data.addresses[1].address_id];
    expect(checkBatch({ subject: { type: 'owner' }, action: { name: algo }, resources: ids }, data).results.map(r => r.id)).toEqual(ids);
    try { checkBatch({ subject: { type: 'owner' }, action: { name: algo }, resources: [ids[0], 'NOPE'] }, data); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(GateError); expect((e as GateError).status).toBe(404); expect((e as GateError).message).toContain('NOPE'); }
  });

  it('is deterministic: the same request twice gives the same decision_id and identical JSON apart from evaluated_ms', () => {
    const id = (newark ?? data.addresses[0]).address_id;
    const a = check(request(id, algo), data); const b = check(request(id, algo), data);
    expect(a.decision_id).toBe(b.decision_id);
    expect({ ...a, evaluated_ms: 0 }).toEqual({ ...b, evaluated_ms: 0 });
    expect(check(request(id, algo, { as_of: '2027-07-02' }), data).decision_id).not.toBe(a.decision_id);
  });
});

describe('real store: facts', () => {
  const missingUnits = data.addresses.filter(a => a.units === null && cityOf(a.address_id) === 'Newark, NJ');

  it('a Newark property without a unit count: deposit review asks for units, and a supplied count removes it and is marked caller', () => {
    expect(missingUnits.length).toBeGreaterThan(0);
    const id = missingUnits[0].address_id;
    const before = check(request(id, 'collect_security_deposit'), data);
    const asks = (r: typeof before) => r.review.filter(i => i.code === 'missing_fact' && i.resolvable_by.includes('units'));
    expect(asks(before).length).toBeGreaterThan(0);
    expect(before.facts.find(f => f.name === 'units')).toMatchObject({ value: null, source: 'missing' });
    const after = check(request(id, 'collect_security_deposit', { facts: { units: 24 } }), data);
    expect(asks(after)).toEqual([]);
    expect(after.facts.find(f => f.name === 'units')).toMatchObject({ value: 24, source: 'caller' });
    CheckResponseSchema.parse(after);
  });

  it('a supplied fact that contradicts the record is fact_conflicts_with_record; an equal one is accepted and stays record', () => {
    const withUnits = data.addresses.find(a => a.units !== null)!;
    const run = () => check(request(withUnits.address_id, algo, { facts: { units: withUnits.units! + 1 } }), data);
    expect(run).toThrow(GateError);
    try { run(); } catch (e) { expect((e as GateError).code).toBe('fact_conflicts_with_record'); expect((e as GateError).status).toBe(400); }
    const same = check(request(withUnits.address_id, algo, { facts: { units: withUnits.units! } }), data);
    expect(same.facts.find(f => f.name === 'units')).toMatchObject({ value: withUnits.units, source: 'record' });
  });

  it('in a batch a contradicting fact is ignored, not an error', () => {
    const withUnits = data.addresses.find(a => a.units !== null)!;
    const run = checkBatch({ subject: { type: 'owner' }, action: { name: algo }, resources: [withUnits.address_id], context: { facts: { units: withUnits.units! + 1 } } }, data);
    expect(run.evaluated).toBe(1);
  });
});

describe('real store: every property and every action', () => {
  it('no response permits while a rule is unknown, a constraint is missing or violated, or a known gap covers it; every response parses', () => {
    const rulesOf = (action: ActionName) => data.rules.filter(r => r.category === ACTIONS[action].category);
    for (const action of ACTION_NAMES) {
      const category = ACTIONS[action].category;
      for (const a of data.addresses) {
        const r = check(request(a.address_id, action), data);
        CheckResponseSchema.parse(r);
        expect(r.disclaimer).toBe(DISCLAIMER);
        expect(r.summary).not.toMatch(/legal|compliant/i);
        expect(r.permit).toBe(r.decision === 'PASS' || r.decision === 'REQUIRE');
        if (!r.permit) continue;
        const results = trace(r);
        const ruleIds = rulesOf(action).map(x => x.team_rule_id);
        expect(ruleIds.some(id => results.get(id) === 'unknown')).toBe(false);
        expect(r.review).toEqual([]);
        expect(r.coverage.known_gaps).toEqual([]);
        expect(data.gaps.some(g => g.category === category && r.coverage.jurisdictions.includes(g.jurisdiction))).toBe(false);
        for (const id of ruleIds.filter(i => results.get(i) === 'applies')) {
          const mine = data.constraints.filter(c => c.rule_id === id && c.action === action);
          expect(mine.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

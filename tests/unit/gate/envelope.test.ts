import { describe, it, expect } from 'vitest';
import { check, type GateData } from '../../../src/gate';
import { ACTIONS, ACTION_NAMES, EnvelopeRequestSchema, EnvelopeResponseSchema, type ActionName, type CheckRequest, type Decision, type EnvelopeInterval, type EnvelopeRequest } from '../../../src/gate/contract';
import { addDays, envelope } from '../../../src/gate/envelope';
import { GateError } from '../../../src/gate/http';
import { gateData } from '../../../src/server/gate';

const data: GateData = gateData();
const ASOF = '2026-10-01';
type Facts = { units?: number; year_built?: number };

const ask = (id: string, action: ActionName, over: { value?: number; as_of?: string; facts?: Facts } = {}): EnvelopeRequest => {
  const parameter = ACTIONS[action].parameter;
  return {
    subject: { type: 'software_agent' },
    action: { name: action, ...(parameter && over.value !== undefined ? { properties: { [parameter.name]: over.value } } : {}) },
    resource: { type: 'property', id },
    context: { as_of: over.as_of ?? ASOF, ...(over.facts && Object.keys(over.facts).length ? { facts: over.facts } : {}) }
  };
};
/** What check() says at one fully specified point. */
const decisionAt = (id: string, action: ActionName, value: number | null, asOf: string, facts: Facts | undefined) => {
  const parameter = ACTIONS[action].parameter;
  const request: CheckRequest = {
    subject: { type: 'software_agent' },
    action: { name: action, ...(parameter ? { properties: { [parameter.name]: value! } } : {}) },
    resource: { type: 'property', id },
    context: { as_of: asOf, ...(facts && Object.keys(facts).length ? { facts } : {}) }
  };
  return check(request, data);
};
const cityOf = (id: string) => data.stacks[id].legal_city;
const inCity = (city: string) => data.addresses.filter(a => cityOf(a.address_id) === city);
const round = (n: number) => Math.round(n * 100) / 100;
/** Both ends and the middle of an amount interval. An exclusive lower end is sampled just inside. */
const amountSamples = (i: EnvelopeInterval) => [...new Set([i.from_exclusive ? round(i.from + 0.01) : i.from, round((i.from + i.to) / 2), i.to])].filter(v => v > (i.from_exclusive ? i.from : i.from - 1) && v <= i.to);
const dateSamples = (from: string | null, to: string | null) => {
  if (from && to) return [...new Set([from, addDays(from, Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000 / 2)), to])];
  if (from) return [from, addDays(from, 200), addDays(from, 4000)];
  if (to) return [addDays(to, -4000), addDays(to, -200), to];
  return ['2000-01-01', ASOF, '2040-01-01'];
};
const factSamples = (from: number | null, to: number | null) => {
  if (from !== null && to !== null) return [...new Set([from, Math.floor((from + to) / 2), to])];
  if (from !== null) return [from, from + 7, from + 500];
  if (to !== null) return [to - 60, to - 5, to];
  return [1950, 1990, 2020];
};

/** Every part of an envelope against check() at sampled points inside it. Returns how many points were compared. */
function assertConsistent(id: string, action: ActionName, over: { value?: number; facts?: Facts }): number {
  const env = envelope(ask(id, action, over), data);
  expect(EnvelopeResponseSchema.safeParse(env).success, `${id} ${action}: response matches the contract`).toBe(true);
  let compared = 0;
  const expectAmounts = (intervals: EnvelopeInterval[], asOf: string, facts: Facts | undefined, where: string) => {
    for (const interval of intervals) for (const value of amountSamples(interval)) {
      const got = decisionAt(id, action, value, asOf, facts);
      expect(got.decision, `${id} ${action} ${where} amount ${value}`).toBe(interval.decision);
      // A permitted amount never rests on a rule the engine could not resolve.
      if (interval.permit) expect(got.review, `${id} ${action} ${where} amount ${value}: nothing unresolved inside a permitted interval`).toEqual([]);
      compared++;
    }
  };
  const expectOutcome = (outcome: { decision: Decision | null; intervals: EnvelopeInterval[] | null }, asOf: string, facts: Facts | undefined, where: string) => {
    if (outcome.intervals) { expect(outcome.decision).toBeNull(); expectAmounts(outcome.intervals, asOf, facts, where); return; }
    expect(decisionAt(id, action, over.value ?? null, asOf, facts).decision, `${id} ${action} ${where}`).toBe(outcome.decision);
    compared++;
  };
  if (env.permitted) {
    expectAmounts(env.permitted.intervals, ASOF, over.facts, 'permitted');
    // The intervals tile the amount's whole range, in order.
    const p = ACTIONS[action].parameter!;
    expect(env.permitted.intervals[0].from).toBe(p.min);
    expect(env.permitted.intervals.at(-1)!.to).toBe(p.max);
    env.permitted.intervals.slice(1).forEach((interval, i) => expect(interval.from).toBe(env.permitted!.intervals[i].to));
  } else expect(ACTIONS[action].parameter).toBeNull();
  for (const axis of env.decides) for (const region of axis.regions) for (const value of factSamples(region.from, region.to)) {
    expectOutcome(region, ASOF, { ...over.facts, [axis.fact]: value }, `${axis.fact}=${value}`);
  }
  expect(env.timeline.filter(t => t.current)).toHaveLength(1);
  expect(env.timeline[0].from).toBeNull();
  expect(env.timeline.at(-1)!.to).toBeNull();
  for (const span of env.timeline) for (const date of dateSamples(span.from, span.to)) expectOutcome(span, date, over.facts, `on ${date}`);
  if (env.decision !== null) expect(env.decision).toBe(decisionAt(id, action, over.value ?? null, ASOF, over.facts).decision);
  return compared;
}

describe('envelope: every part agrees with check()', () => {
  it('for every fifth property, each action, amount open and amount fixed, with and without a supplied unit count', () => {
    let compared = 0;
    data.addresses.filter((_, i) => i % 5 === 0).forEach(address => {
      for (const action of ACTION_NAMES) {
        const example = ACTIONS[action].parameter?.example;
        const facts = address.units === null ? { units: 24 } : undefined;
        compared += assertConsistent(address.address_id, action, {});
        if (example !== undefined) compared += assertConsistent(address.address_id, action, { value: example });
        if (facts) compared += assertConsistent(address.address_id, action, { facts });
      }
    });
    expect(compared).toBeGreaterThan(2000);
  });
});

describe('envelope: what the verified store yields', () => {
  const deposit = 'collect_security_deposit' as const;
  const algo = 'set_rent_with_pricing_algorithm' as const;

  it('Jersey City deposit with no unit count: units is the deciding fact, and nothing is permitted until it is known', () => {
    const property = inCity('Jersey City, NJ').find(a => a.units === null)!;
    expect(property).toBeDefined();
    const env = envelope(ask(property.address_id, deposit), data);
    expect(env.decision).toBeNull();
    expect(env.permitted!.reason).toBe('bound_not_computable');
    expect(env.permitted!.intervals.some(i => i.permit)).toBe(false);
    const axis = env.decides.find(d => d.fact === 'units')!;
    expect(axis).toBeDefined();
    expect(axis.regions.length).toBeGreaterThan(1);
    // With enough units the state cap applies: permitted up to 1.5 months, bounded by the statute's own words.
    const covered = axis.regions.at(-1)!;
    expect(covered.to).toBeNull();
    const allowed = covered.intervals!.filter(i => i.permit);
    expect(allowed).toHaveLength(1);
    expect(allowed[0].to).toBe(1.5);
    expect(allowed[0].bound_text).toMatch(/one and one-half/);
  });

  it('the same property with 24 units supplied: the deciding fact is gone and the permitted interval ends at 1.5 months', () => {
    const property = inCity('Jersey City, NJ').find(a => a.units === null)!;
    const env = envelope(ask(property.address_id, deposit, { facts: { units: 24 } }), data);
    expect(env.decides).toEqual([]);
    expect(env.permitted!.reason).toBeNull();
    const allowed = env.permitted!.intervals.filter(i => i.permit);
    expect(allowed.map(i => [i.from, i.to])).toEqual([[0, 1.5]]);
    expect(allowed[0].bounding_rule_id).toBeTruthy();
    expect(env.permitted!.intervals.at(-1)!.decision).toBe('BLOCK');
    expect(env.obligations.length).toBeGreaterThan(0);
    expect(env.evidence.some(e => /one and one-half/.test(e.quoted_span))).toBe(true);
    // A fixed amount gives the gate's own decision as the degenerate case.
    expect(envelope(ask(property.address_id, deposit, { value: 2, facts: { units: 24 } }), data).decision).toBe('BLOCK');
    expect(envelope(ask(property.address_id, deposit, { value: 1.5, facts: { units: 24 } }), data).decision).toBe('REQUIRE');
  });

  it('Los Angeles pricing algorithm: the timeline changes on 2026-01-01, caused by the state act taking effect', () => {
    const property = inCity('Los Angeles, CA')[0];
    const env = envelope(ask(property.address_id, algo), data);
    expect(env.permitted).toBeNull();
    const change = env.timeline.find(t => t.from === '2026-01-01')!;
    expect(change).toBeDefined();
    expect(change.decision).toBe('REVIEW');
    expect(change.current).toBe(true);
    expect(change.cause_label).toMatch(/takes effect/);
    expect(change.cause_rule_ids.some(id => id.startsWith('CA-ALG'))).toBe(true);
    const before = env.timeline[env.timeline.indexOf(change) - 1];
    expect(before.decision).toBe('PASS');
    expect(before.to).toBe('2025-12-31');
  });

  it('San Francisco pricing algorithm: blocked now, with the date the local ban took effect on the timeline', () => {
    const property = inCity('San Francisco, CA')[0];
    const env = envelope(ask(property.address_id, algo), data);
    expect(env.decision).toBe('BLOCK');
    expect(env.timeline.find(t => t.current)!.decision).toBe('BLOCK');
  });
});

describe('envelope: identity and the request edge', () => {
  const id = data.addresses[0].address_id;
  it('the same question gives the same envelope id; a different question gives another', () => {
    const a = envelope(ask(id, 'collect_security_deposit'), data);
    const b = envelope(ask(id, 'collect_security_deposit'), data);
    expect(a.envelope_id).toBe(b.envelope_id);
    expect(a.envelope_id).toMatch(/^env_[0-9a-f]{16}$/);
    expect(envelope(ask(id, 'collect_security_deposit', { value: 1 }), data).envelope_id).not.toBe(a.envelope_id);
    expect(envelope(ask(id, 'collect_security_deposit', { as_of: '2027-01-01' }), data).envelope_id).not.toBe(a.envelope_id);
    const { evaluated_ms: _a, ...restA } = a; const { evaluated_ms: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });
  it('the amount may be left out; a parameter of another action is refused', () => {
    expect(EnvelopeRequestSchema.safeParse(ask(id, 'collect_security_deposit')).success).toBe(true);
    expect(EnvelopeRequestSchema.safeParse({ ...ask(id, 'collect_security_deposit'), action: { name: 'collect_security_deposit', properties: { fee_usd: 10 } } }).success).toBe(false);
  });
  it('an unknown property and a fact that contradicts the record are refused as /check refuses them', () => {
    expect(() => envelope(ask('NOPE', 'collect_security_deposit'), data)).toThrow(GateError);
    const withUnits = data.addresses.find(a => a.units !== null)!;
    expect(() => envelope(ask(withUnits.address_id, 'collect_security_deposit', { facts: { units: withUnits.units! + 1 } }), data)).toThrow(GateError);
  });
});

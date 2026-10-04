// Attempts to falsify the gate on the real store. Each test states the failure it tries to produce.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAddress } from '../../../src/ordinal/apply/index';
import { loadOfficialDocs, loadSupplementalDocs, PATHS } from '../../../src/ordinal/corpus';
import { loadIngestedDocs } from '../../../src/ordinal/compile/ingest';
import { ACTIONS, ACTION_NAMES, type CheckRequest, type CheckResponse } from '../../../src/gate/contract';
import { check, checkBatch } from '../../../src/gate/index';
import { parseQuantity } from '../../../src/gate/quantity';
import { GATE_PATHS, readConstraints, readWithheld } from '../../../src/gate/store';
import { gateData } from '../../../src/server/gate';

const data = gateData();
const DATES = ['2025-12-31', '2026-01-02', '2026-10-01', '2027-07-02'];
const request = (name: (typeof ACTION_NAMES)[number], id: string, asOf: string, value?: number, facts?: { units?: number; year_built?: number }): CheckRequest => {
  const parameter = ACTIONS[name].parameter;
  return {
    subject: { type: 'property_manager' }, resource: { type: 'property', id },
    action: { name, ...(parameter ? { properties: { [parameter.name]: value ?? parameter.example } } : {}) },
    context: { as_of: asOf, ...(facts ? { facts } : {}) }
  };
};
const everything = function* (): Generator<{ req: CheckRequest; res: CheckResponse }> {
  for (const name of ACTION_NAMES) for (const asOf of DATES) for (const a of data.addresses) {
    const req = request(name, a.address_id, asOf);
    yield { req, res: check(req, data) };
    if (a.units === null) { const withUnits = request(name, a.address_id, asOf, undefined, { units: 24 }); yield { req: withUnits, res: check(withUnits, data) }; }
  }
};

describe('1, 2, 5, 6: permits, upcoming law and conflicts across every property, action and date', () => {
  it('never permits with an unknown rule, an unmodeled or unresolved applying rule, or a known gap; never decides on law not in force; never drops a conflict', () => {
    let checked = 0;
    for (const { req, res } of everything()) {
      checked++;
      const spec = ACTIONS[req.action.name];
      const address = { ...data.addresses.find(a => a.address_id === req.resource.id)!, ...(req.context?.facts?.units !== undefined ? { units: req.context.facts.units } : {}) };
      const stack = data.stacks[req.resource.id];
      const rules = data.rules.filter(r => r.category === spec.category);
      const engine = new Map(applyAddress(rules, address, stack, req.context!.as_of!).map(r => [r.team_rule_id, r]));
      const where = `${req.action.name} ${req.resource.id} ${req.context!.as_of}`;

      if (res.permit) {
        expect(['PASS', 'REQUIRE'], where).toContain(res.decision);
        expect(res.review, where).toEqual([]);
        expect(res.coverage.known_gaps, where).toEqual([]);
        for (const r of engine.values()) {
          expect(r.result, where).not.toBe('unknown');
          if (r.result === 'applies') {
            const own = data.constraints.filter(c => c.rule_id === r.team_rule_id && c.action === req.action.name);
            expect(own.length, `${where}: ${r.team_rule_id} applies with no verified constraint`).toBeGreaterThan(0);
            expect(own.some(c => c.effect === 'prohibit'), `${where}: ${r.team_rule_id} prohibits`).toBe(false);
            expect(r.conflict_flag, `${where}: ${r.team_rule_id} conflict`).toBe(false);
          }
        }
      } else expect(['BLOCK', 'REVIEW'], where).toContain(res.decision);

      // 5. Only rules the engine says apply or are unknown on this date may determine the decision.
      for (const row of res.determining) expect(['applies', 'unknown'], `${where}: ${row.rule_id} determines`).toContain(engine.get(row.rule_id)!.result);
      for (const u of res.upcoming) expect(['pending', 'not_yet_effective'], where).toContain(engine.get(u.rule_id)!.result);
      for (const o of res.obligations) expect(engine.get(o.rule_id)!.result, where).toBe('applies');

      // 6. A conflict flag on an applying rule is always visible: on a blocking row, or as a review item.
      for (const r of engine.values()) {
        if (r.result !== 'applies' || !r.conflict_flag) continue;
        const onRow = res.determining.some(d => d.rule_id === r.team_rule_id && d.outcome === 'violated' && d.conflict_note);
        const inReview = res.review.some(v => v.code === 'conflict' && v.rule_id === r.team_rule_id);
        expect(onRow || inReview, `${where}: conflict on ${r.team_rule_id} not shown`).toBe(true);
      }
      // The trace reports the engine's own result for every rule of the category.
      for (const t of res.trace) expect(t.result, where).toBe(engine.get(t.rule_id)!.result);
      expect(res.summary, where).not.toMatch(/\b(legal|compliant|lawful)\b/i);
      expect(res.disclaimer).toContain('Not legal advice');
    }
    expect(checked).toBeGreaterThan(data.addresses.length * ACTION_NAMES.length * DATES.length - 1);
  }, 120_000);
});

describe('3: nothing unverified reaches a decision', () => {
  const docs = new Map([...loadOfficialDocs(), ...loadSupplementalDocs(), ...loadIngestedDocs(PATHS.ingested)].map(d => [d.doc_id, d]));
  it('every served constraint is a literal slice of its rule\'s source, and every figure is the one a fixed parser reads from the quoted words', () => {
    expect(data.constraints.length).toBeGreaterThan(0);
    for (const c of data.constraints) {
      const doc = docs.get(c.source_doc_id)!;
      expect(doc.text.slice(c.span_start, c.span_end), c.constraint_id).toBe(c.evidence_quote);
      const rule = data.rules.find(r => r.team_rule_id === c.rule_id)!;
      expect(rule.source_doc_id, c.constraint_id).toBe(c.source_doc_id);
      expect(ACTIONS[c.action].category, c.constraint_id).toBe(rule.category);
      if (c.max !== null) expect(parseQuantity(c.value_text!, c.parameter!), c.constraint_id).toBe(c.max);
      if (c.hard_max !== null) expect(parseQuantity(c.hard_max_text!, c.parameter!), c.constraint_id).toBe(c.hard_max);
      if (c.hard_max_quote) expect(doc.text, c.constraint_id).toContain(c.hard_max_quote);
    }
  });
  it('a withheld proposal is not in the served set, and the decision code never reads the withheld file or calls a model', () => {
    const servedQuotes = new Set(data.constraints.map(c => `${c.rule_id}|${c.effect}|${c.evidence_quote}`));
    for (const w of readWithheld()) expect(servedQuotes.has(`${w.rule_id}|${w.effect}|${w.proposed_quote}`), w.rule_id).toBe(false);
    for (const file of ['src/gate/index.ts', 'src/gate/decide.ts', 'src/gate/trace.ts', 'src/gate/coverage.ts', 'src/gate/facts.ts', 'src/gate/summary.ts', 'src/gate/http.ts', 'src/server/gate.ts', 'src/app/api/v1/check/route.ts', 'src/app/api/v1/checks/route.ts']) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/readWithheld|constraints\.withheld|createConstraintClient|\.\/model|\.\/compile|generateText|child_process|fetch\(/);
    }
  });
  it('a constraint whose stored quote no longer matches its source is dropped at load, not served', () => {
    const stored = readConstraints(GATE_PATHS.constraints);
    expect(data.constraints.length).toBe(stored.length);
  });
});

describe('4: a caller fact never overrides the record', () => {
  const withUnits = data.addresses.find(a => a.units !== null)!;
  it('single check: a contradicting value is refused; batch: it is ignored and the record decides', () => {
    expect(() => check(request('collect_security_deposit', withUnits.address_id, '2026-10-01', 2, { units: withUnits.units! + 1 }), data)).toThrow(/differs from the recorded value/);
    const same = check(request('collect_security_deposit', withUnits.address_id, '2026-10-01', 2, { units: withUnits.units! }), data);
    expect(same.facts.find(f => f.name === 'units')).toMatchObject({ value: withUnits.units, source: 'record' });
    const plain = checkBatch({ subject: { type: 'owner' }, action: { name: 'collect_security_deposit', properties: { amount_months_rent: 2 } }, context: { as_of: '2026-10-01' }, resources: [withUnits.address_id] }, data);
    const forced = checkBatch({ subject: { type: 'owner' }, action: { name: 'collect_security_deposit', properties: { amount_months_rent: 2 } }, context: { as_of: '2026-10-01', facts: { units: 1 } }, resources: [withUnits.address_id] }, data);
    expect(forced.results).toEqual(plain.results);
  });
});

describe('9: one canonical request, one decision id', () => {
  it('key order, defaults and repeated calls do not change the id; the actor does, the date does, the parameter does', () => {
    const id = data.addresses[0].address_id;
    const a = check(request('collect_security_deposit', id, '2026-10-01', 2), data);
    const reordered = check({ context: { as_of: '2026-10-01' }, resource: { id, type: 'property' }, action: { properties: { amount_months_rent: 2 }, name: 'collect_security_deposit' }, subject: { type: 'property_manager' } }, data);
    const defaulted = check({ subject: { type: 'property_manager' }, action: { name: 'collect_security_deposit', properties: { amount_months_rent: 2 } }, resource: { type: 'property', id } }, data);
    expect(reordered.decision_id).toBe(a.decision_id);
    expect(defaulted.decision_id).toBe(a.decision_id);
    expect(check(request('collect_security_deposit', id, '2026-10-01', 2.5), data).decision_id).not.toBe(a.decision_id);
    expect(check(request('collect_security_deposit', id, '2026-10-02', 2), data).decision_id).not.toBe(a.decision_id);
    expect(check({ ...request('collect_security_deposit', id, '2026-10-01', 2), subject: { type: 'owner' } }, data).decision_id).not.toBe(a.decision_id);
  });
});

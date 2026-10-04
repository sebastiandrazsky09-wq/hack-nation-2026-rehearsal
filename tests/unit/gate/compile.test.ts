import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InternalRule } from '../../../src/ordinal/contracts';
import type { SourceDoc } from '../../../src/ordinal/corpus';
import { ACTIONS, ConstraintSchema } from '../../../src/gate/contract';
import { runConstrain, verifyProposal, type Proposal } from '../../../src/gate/compile';
import type { ConstraintClient } from '../../../src/gate/model';

// Invented law. Nothing here is taken from the corpus.
const TEXT = [
  'SOURCE: https://example.test/code/12', 'RETRIEVED: 2026-01-01', '',
  'Section 12. A landlord shall not demand a storage deposit exceeding one and one-half times one month\'s rent.',
  'The landlord shall give the tenant a dated receipt for any storage deposit within ten days.',
  'Section 13. It is unlawful to charge a key fee which exceeds $40.',
  'Section 14. No person shall use a rent-setting device as part of a contract or conspiracy with a competitor.',
  'Section 15. No landlord shall use a rent-setting device.'
].join('\n');
const doc: SourceDoc = { doc_id: 'T001', jurisdiction: 'ZZ', source_url: 'https://example.test/code/12', retrieved_at: '2026-01-01', origin: 'official_captured', path: 'x', text: TEXT } as SourceDoc;
const quote = 'A landlord shall not demand a storage deposit exceeding one and one-half times one month\'s rent.';
const rule = (category: InternalRule['category'], id = 'ZZ-TEST-000001') => ({
  team_rule_id: id, jurisdiction: 'ZZ', category, title: 'Test rule', requirement: 'r', key_value: null, citation: 'Sec. 12',
  source_doc_id: 'T001', quoted_span: quote, span_start: TEXT.indexOf(quote), span_end: TEXT.indexOf(quote) + quote.length, verified: true
}) as unknown as InternalRule;
const base = { max: null, value_text: null, hard_max: null, hard_max_text: null, hard_max_quote: null, cap_can_rise: false, figure_year: null, elements_untestable: null, obligation_text: null };
const deposit = ACTIONS.collect_security_deposit; const fee = ACTIONS.charge_application_fee; const algo = ACTIONS.set_rent_with_pricing_algorithm;
type P = Proposal['constraints'][number];
const check = (p: P, action = deposit, repaired: string | null = null) => verifyProposal(p, rule(action.category), action, doc, repaired, 'fake');

describe('verifyProposal: what may enter the constraint store', () => {
  it('accepts a limit whose quote is in the source and whose figure the parser reads from the quoted words', () => {
    const r = check({ ...base, effect: 'limit', max: 1.5, value_text: 'one and one-half times one month\'s rent', evidence_quote: quote });
    expect('constraint' in r && r.constraint).toMatchObject({ effect: 'limit', max: 1.5, parameter: 'amount_months_rent', value_check: 'parsed', verification_method: 'exact', evidence_quote: quote });
    if ('constraint' in r) { ConstraintSchema.parse(r.constraint); expect(TEXT.slice(r.constraint.span_start, r.constraint.span_end)).toBe(r.constraint.evidence_quote); }
  });
  it('withholds a quote that is not in the source', () => {
    const r = check({ ...base, effect: 'limit', max: 1.5, value_text: 'one and one-half', evidence_quote: 'A landlord may never take more than one and one-half months of rent as a deposit.' });
    expect('withheld' in r && r.withheld.reason).toMatch(/not in the source/);
  });
  it('withholds a figure the quoted words do not state', () => {
    const r = check({ ...base, effect: 'limit', max: 2, value_text: 'one and one-half times one month\'s rent', evidence_quote: quote });
    expect('withheld' in r && r.withheld.reason).toMatch(/read as 1.5/);
  });
  it('withholds a figure whose words are not inside the quote', () => {
    const r = check({ ...base, effect: 'limit', max: 2, value_text: 'two months\' rent', evidence_quote: quote });
    expect('withheld' in r && r.withheld.reason).toMatch(/not inside the quote/);
  });
  it('withholds a figure with no words at all', () => {
    const r = check({ ...base, effect: 'limit', max: 1.5, value_text: null, evidence_quote: quote });
    expect('withheld' in r).toBe(true);
  });
  it('accepts a dollar limit and reads the amount', () => {
    const r = check({ ...base, effect: 'limit', max: 40, value_text: '$40', evidence_quote: 'It is unlawful to charge a key fee which exceeds $40.' }, fee);
    expect('constraint' in r && r.constraint.max).toBe(40);
  });
  it('withholds a limit proposed for an action with no parameter', () => {
    const r = check({ ...base, effect: 'limit', max: 40, value_text: '$40', evidence_quote: 'It is unlawful to charge a key fee which exceeds $40.' }, algo);
    expect('withheld' in r).toBe(true);
  });
  it('keeps a limit with no figure as not computable', () => {
    const r = check({ ...base, effect: 'limit', evidence_quote: quote });
    expect('constraint' in r && r.constraint).toMatchObject({ max: null, hard_max: null, value_check: 'none' });
  });
  it('a repaired quote is accepted only if the repair is in the source, and is marked repaired', () => {
    const bad = 'Landlords may not demand storage deposits above one and a half months of rent.';
    const r = check({ ...base, effect: 'none', evidence_quote: bad }, deposit, quote);
    expect('constraint' in r && r.constraint).toMatchObject({ verification_method: 'repaired', evidence_quote: quote });
    expect('withheld' in check({ ...base, effect: 'none', evidence_quote: bad }, deposit, 'still not in the source text at all')).toBe(true);
  });
  it('a ban whose quote names a contract or conspiracy is conditional even if the model did not say so', () => {
    const r = check({ ...base, effect: 'prohibit', evidence_quote: 'No person shall use a rent-setting device as part of a contract or conspiracy with a competitor.' }, algo);
    expect('constraint' in r && r.constraint.elements_untestable).toMatch(/contract/);
  });
  it('a plain ban is unconditional', () => {
    const r = check({ ...base, effect: 'prohibit', evidence_quote: 'No landlord shall use a rent-setting device.' }, algo);
    expect('constraint' in r && r.constraint.elements_untestable).toBeNull();
  });
  it('withholds an obligation that states no duty', () => {
    const q = 'The landlord shall give the tenant a dated receipt for any storage deposit within ten days.';
    expect('withheld' in check({ ...base, effect: 'obligation', evidence_quote: q })).toBe(true);
    expect('constraint' in check({ ...base, effect: 'obligation', obligation_text: 'Give a dated receipt within ten days.', evidence_quote: q })).toBe(true);
  });
});

describe('runConstrain', () => {
  const answer: Proposal = { constraints: [
    { ...base, effect: 'limit', max: 1.5, value_text: 'one and one-half times one month\'s rent', evidence_quote: quote },
    { ...base, effect: 'limit', max: 3, value_text: 'one and one-half times one month\'s rent', evidence_quote: quote }
  ] };
  const fake = (calls: { n: number }): ConstraintClient => ({ model: 'fake', async ask(_s, _p, schema) { calls.n++; return schema.parse(answer); } });
  it('writes verified constraints, records withheld ones, and replays offline with no call', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gate-constrain-'));
    const files = { cacheDir: path.join(dir, 'cache'), constraintFile: path.join(dir, 'c.jsonl'), withheldFile: path.join(dir, 'w.jsonl'), reviewFile: path.join(dir, 'review.json') };
    const rules = [rule('security_deposits'), rule('rent_increase_limits', 'ZZ-OTHER-000002')];
    const calls = { n: 0 };
    const first = await runConstrain({}, { client: fake(calls), rules, docs: [doc], ...files });
    expect(first).toMatchObject({ rules: 1, model_calls: 1, verified: 1, withheld: 1, errors: [], rules_without_constraint: [] });
    const stored = readFileSync(files.constraintFile, 'utf8');
    const again = await runConstrain({ offline: true }, { client: fake(calls), rules, docs: [doc], ...files });
    expect(calls.n).toBe(1);
    expect(again.model_calls).toBe(0);
    expect(readFileSync(files.constraintFile, 'utf8')).toBe(stored);
  });
  it('offline with no cache is an error for that rule, not a guess', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gate-constrain-'));
    const report = await runConstrain({ offline: true }, { client: fake({ n: 0 }), rules: [rule('security_deposits')], docs: [doc], cacheDir: path.join(dir, 'cache'), constraintFile: path.join(dir, 'c.jsonl'), withheldFile: path.join(dir, 'w.jsonl'), reviewFile: path.join(dir, 'review.json') });
    expect(report.errors).toHaveLength(1);
    expect(report.verified).toBe(0);
    expect(report.rules_without_constraint).toEqual(['ZZ-TEST-000001']);
  });
});

describe('verifyProposal: guards added after reading the first live pass', () => {
  const TEXT2 = [
    'SOURCE: https://example.test/code/20', '',
    'Section 20. A landlord shall not demand a storage deposit exceeding one month\'s rent.',
    'Section 21. For a furnished unit the storage deposit shall not exceed two months\' rent.',
    'Section 22. The key fee shall not exceed $40. The $40 fee may be adjusted annually by the Consumer Price Index.',
    'Section 23. The maximum key fee for 2031 is $44.',
    'Storage units built before 1990 Fully Covered Yes Yes',
    'e. any person to hold a spare key.'
  ].join('\n');
  const doc2 = { ...doc, text: TEXT2 } as SourceDoc;
  const r2 = (category: InternalRule['category'], extra: Partial<InternalRule> = {}) => ({ ...rule(category), quoted_span: 'x', span_start: 0, span_end: 1, ...extra }) as InternalRule;
  const run = (p: P, action = deposit, extraRule: Partial<InternalRule> = {}) => verifyProposal(p, r2(action.category, extraRule), action, doc2, null, 'fake');
  const general = 'A landlord shall not demand a storage deposit exceeding one month\'s rent.';
  const furnished = 'For a furnished unit the storage deposit shall not exceed two months\' rent.';

  it('a higher cap for some cases is held with its own quote, which must be in the source', () => {
    const ok = run({ ...base, effect: 'limit', max: 1, value_text: 'one month\'s rent', hard_max: 2, hard_max_text: 'two months\' rent', hard_max_quote: furnished, evidence_quote: general });
    expect('constraint' in ok && ok.constraint).toMatchObject({ max: 1, hard_max: 2, hard_max_quote: furnished, open_above: false });
    const bad = run({ ...base, effect: 'limit', max: 1, value_text: 'one month\'s rent', hard_max: 2, hard_max_text: 'two months\' rent', hard_max_quote: 'A furnished unit may carry two months\' rent as deposit.', evidence_quote: general });
    expect('withheld' in bad).toBe(true);
  });
  it('a cap the text lets rise is marked open above, from the quote or from the rule\'s own extracted fields', () => {
    const q = 'The key fee shall not exceed $40. The $40 fee may be adjusted annually by the Consumer Price Index.';
    const a = run({ ...base, effect: 'limit', max: 40, value_text: '$40', evidence_quote: q }, fee);
    expect('constraint' in a && a.constraint.open_above).toBe(true);
    const b = run({ ...base, effect: 'limit', max: 44, value_text: '$44', figure_year: 2031, evidence_quote: 'The maximum key fee for 2031 is $44.' }, fee, { key_value: '$44 cap, adjusted annually for CPI' });
    expect('constraint' in b && b.constraint).toMatchObject({ open_above: true, figure_year: 2031 });
  });
  it('a figure year that is not in the quote is withheld', () => {
    expect('withheld' in run({ ...base, effect: 'limit', max: 44, value_text: '$44', figure_year: 2030, evidence_quote: 'The maximum key fee for 2031 is $44.' }, fee)).toBe(true);
  });
  it('a fragment with no words that forbid is not a ban, and a table row is not a duty', () => {
    expect('withheld' in run({ ...base, effect: 'prohibit', evidence_quote: 'e. any person to hold a spare key.' }, algo)).toBe(true);
    expect('withheld' in run({ ...base, effect: 'obligation', obligation_text: 'Pay interest.', evidence_quote: 'Storage units built before 1990 Fully Covered Yes Yes' })).toBe(true);
  });
});

describe('lead review file', () => {
  it('a rejected constraint leaves the store and is recorded as withheld with the reason', async () => {
    const { writeFileSync } = await import('node:fs');
    const dir = mkdtempSync(path.join(tmpdir(), 'gate-constrain-'));
    const files = { cacheDir: path.join(dir, 'cache'), constraintFile: path.join(dir, 'c.jsonl'), withheldFile: path.join(dir, 'w.jsonl'), reviewFile: path.join(dir, 'review.json') };
    const answer: Proposal = { constraints: [{ ...base, effect: 'limit', max: 1.5, value_text: 'one and one-half times one month\'s rent', evidence_quote: quote }] };
    const client: ConstraintClient = { model: 'fake', async ask(_s, _p, schema) { return schema.parse(answer); } };
    const first = await runConstrain({}, { client, rules: [rule('security_deposits')], docs: [doc], ...files });
    expect(first.verified).toBe(1);
    const id = JSON.parse(readFileSync(files.constraintFile, 'utf8').trim()).constraint_id;
    writeFileSync(files.reviewFile, JSON.stringify({ rejected: [{ constraint_id: id, reason: 'test' }] }));
    const second = await runConstrain({ offline: true }, { client, rules: [rule('security_deposits')], docs: [doc], ...files });
    expect(second).toMatchObject({ verified: 0, withheld: 1, rules_without_constraint: ['ZZ-TEST-000001'] });
    expect(readFileSync(files.withheldFile, 'utf8')).toContain('rejected in lead review: test');
  });
});

describe('one repair attempt for a quote that lacks the operative words', () => {
  const LIST = ['SOURCE: https://example.test/code/30', '', '4. It shall be unlawful for:', 'a. a storage owner to hold a spare key;', 'b. any person to copy a key.'].join('\n');
  const listDoc = { ...doc, text: LIST } as SourceDoc;
  const r = (repair: string | null) => verifyProposal({ ...base, effect: 'prohibit', evidence_quote: 'a. a storage owner to hold a spare key;' }, rule('algorithmic_rent_setting'), algo, listDoc, null, 'fake', repair);
  it('a wider passage is accepted only if it is in the source and itself forbids', () => {
    const ok = r('4. It shall be unlawful for:\na. a storage owner to hold a spare key;');
    expect('constraint' in ok && ok.constraint).toMatchObject({ verification_method: 'repaired', elements_untestable: null });
    expect('withheld' in r(null)).toBe(true);
    expect('withheld' in r('It is unlawful for a storage owner to hold a spare key.')).toBe(true);
    expect('withheld' in r('b. any person to copy a key.')).toBe(true);
  });
  it('"contract for" as conduct is not a conspiracy element, "agreement among" is', () => {
    const T = 'SOURCE: x\n\nIt shall be unlawful for an owner to subscribe to or contract for the services of a rate setter.\nIt shall be unlawful for a rate setter to facilitate an agreement among owners.';
    const d = { ...doc, text: T } as SourceDoc;
    const a = verifyProposal({ ...base, effect: 'prohibit', evidence_quote: 'It shall be unlawful for an owner to subscribe to or contract for the services of a rate setter.' }, rule('algorithmic_rent_setting'), algo, d, null, 'fake');
    const b = verifyProposal({ ...base, effect: 'prohibit', evidence_quote: 'It shall be unlawful for a rate setter to facilitate an agreement among owners.' }, rule('algorithmic_rent_setting'), algo, d, null, 'fake');
    expect('constraint' in a && a.constraint.elements_untestable).toBeNull();
    expect('constraint' in b && b.constraint.elements_untestable).toMatch(/agreement among/);
  });
});

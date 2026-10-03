import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCompile, type GroupAnswer, type GroupRequest, type RawRule } from '../../../../src/ordinal/compile';
import { readRuleStore } from '../../../../src/ordinal/corpus';
import { fakeClient, paths, rawRule, sourceDoc } from './helpers';

const sentence = (tag: string) => `The ${tag} provision requires the landlord to follow a specific written procedure.`;
const docWith = (doc_id: string, tags: string[], over: Partial<Parameters<typeof sourceDoc>[0]> = {}) =>
  sourceDoc({ doc_id, text: `SOURCE: https://example.test/${doc_id}\nRETRIEVED: 2026-01-01\n\n${tags.map(sentence).join('\n')}\n`, ...over });

/** One scripted rule per (document, tag); the title's first word names the law. */
type Spec = Partial<RawRule> & { tag: string };
const rulesFor = (specs: Record<string, Spec[]>) => (req: { doc: { doc_id: string } }) =>
  (specs[req.doc.doc_id] ?? []).map(({ tag, ...rest }) => rawRule({ title: `${rest.title ?? 'LAW'} ${tag}`, citation: `Cite ${tag}`, quoted_span: sentence(tag), ...rest }));

/** Groups candidates by the first word of the title; the first id of each group is the primary. */
const byLaw = (req: GroupRequest): GroupAnswer => {
  const laws = new Map<string, string[]>();
  for (const c of req.candidates) laws.set(c.title.split(' ')[0], [...(laws.get(c.title.split(' ')[0]) ?? []), c.id]);
  return { groups: [...laws.values()].map(ids => ({ member_ids: ids, primary_id: ids[0] })) };
};

const CELL = 'cell:NJ|screening_restrictions';

describe('consolidation', () => {
  it('turns four provisions plus a second document into one rule, and keeps a second law separate', async () => {
    const p = paths();
    const d1 = docWith('D1', ['a1', 'a2', 'a3', 'a4', 'b1']);
    const d2 = docWith('D2', ['c1'], { origin: 'supplemental' });
    const fake = fakeClient(rulesFor({
      D1: [{ tag: 'a1', title: 'FCHA' }, { tag: 'a2', title: 'FCHA' }, { tag: 'a3', title: 'FCHA' }, { tag: 'a4', title: 'FCHA' }, { tag: 'b1', title: 'OTHER' }],
      D2: [{ tag: 'c1', title: 'FCHA' }]
    }), undefined, byLaw);
    const report = await runCompile({}, { ...p, client: fake.client, docs: [d1, d2] });
    expect(fake.groupCalls).toHaveLength(1);
    expect(report).toMatchObject({ rules_total: 2, rules_verified: 2, rules_unverified: 0, docs_failed: [] });
    const rules = readRuleStore(p.ruleStorePath);
    const fcha = rules.find(r => r.title.startsWith('FCHA'))!;
    expect(fcha.source_doc_id).toBe('D1');
    expect(fcha.also_supported_by.map(s => s.source_doc_id).sort()).toEqual(['D1', 'D1', 'D1', 'D2']);
    expect(rules.find(r => r.title.startsWith('OTHER'))!.also_supported_by).toEqual([]);
    const lines = readFileSync(path.join(p.root, 'candidates.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).candidate_id);
    expect(lines).toEqual(['D1#1', 'D1#2', 'D1#3', 'D1#4', 'D1#5', 'D2#1']);
  });

  it('makes no group call for a cell with a single candidate', async () => {
    const p = paths();
    const fake = fakeClient(rulesFor({ D1: [{ tag: 'a1' }] }));
    const report = await runCompile({}, { ...p, client: fake.client, docs: [docWith('D1', ['a1'])] });
    expect(fake.groupCalls).toHaveLength(0);
    expect(report).toMatchObject({ rules_total: 1, llm_calls: 1 });
  });

  describe('invalid grouping answers', () => {
    const cases: [string, (ids: string[]) => GroupAnswer, string][] = [
      ['a missing id', ([a, b]) => ({ groups: [{ member_ids: [a, b], primary_id: a }] }), 'missing id'],
      ['a duplicated id', ([a, b, c]) => ({ groups: [{ member_ids: [a, b], primary_id: a }, { member_ids: [b, c], primary_id: c }] }), 'duplicated id'],
      ['an unknown id', ([a, b, c]) => ({ groups: [{ member_ids: [a, b, c, 'ZZ#9'], primary_id: a }] }), 'unknown id'],
      ['a primary outside its group', ([a, b, c]) => ({ groups: [{ member_ids: [a, b], primary_id: c }, { member_ids: [c], primary_id: c }] }), 'not in its group']
    ];
    it.each(cases)('%s falls back to singletons and is reported', async (_name, answer, needle) => {
      const p = paths();
      const fake = fakeClient(rulesFor({ D1: [{ tag: 'a1' }, { tag: 'a2' }, { tag: 'a3' }] }), undefined, req => answer(req.candidates.map(c => c.id)));
      const report = await runCompile({}, { ...p, client: fake.client, docs: [docWith('D1', ['a1', 'a2', 'a3'])] });
      expect(fake.groupCalls).toHaveLength(1);
      const rules = readRuleStore(p.ruleStorePath);
      expect(rules).toHaveLength(3);
      expect(rules.every(r => r.also_supported_by.length === 0)).toBe(true);
      expect(report.docs_failed).toHaveLength(1);
      expect(report.docs_failed[0].doc_id).toBe(CELL);
      expect(report.docs_failed[0].error).toContain(needle);
    });
  });

  describe('primary choice', () => {
    it('takes the verified member when the model picked an unverified one', async () => {
      const p = paths();
      const doc = docWith('D1', ['a1']);
      const fake = fakeClient(() => [
        rawRule({ title: 'LAW good', citation: 'Cite a', quoted_span: sentence('a1') }),
        rawRule({ title: 'LAW bad', citation: 'Cite b', quoted_span: 'This sentence is nowhere in the document at all.' })
      ], () => 'Neither is this one, anywhere in the document.', req => ({ groups: [{ member_ids: req.candidates.map(c => c.id), primary_id: req.candidates.map(c => c.id).sort().at(-1)! }] }));
      await runCompile({}, { ...p, client: fake.client, docs: [doc] });
      const [rule] = readRuleStore(p.ruleStorePath);
      expect(rule).toMatchObject({ verified: true, title: 'LAW good' });
      expect(rule.also_supported_by).toHaveLength(1);
      expect(rule.also_supported_by[0].verified).toBe(false);
    });

    it('takes the official_captured member when the model picked a supplemental one of equal verification', async () => {
      const p = paths();
      const official = docWith('DO', ['a1']);
      const supplemental = docWith('DS', ['a2'], { origin: 'supplemental' });
      const fake = fakeClient(rulesFor({ DO: [{ tag: 'a1', citation: 'Cite same' }], DS: [{ tag: 'a2', citation: 'Cite same-ish' }] }), undefined,
        req => ({ groups: [{ member_ids: req.candidates.map(c => c.id), primary_id: req.candidates.find(c => c.source_doc_id === 'DS')!.id }] }));
      await runCompile({}, { ...p, client: fake.client, docs: [supplemental, official] });
      const [rule] = readRuleStore(p.ruleStorePath);
      expect(rule.source_doc_id).toBe('DO');
      expect(rule.source_origin).toBe('official_captured');
      expect(rule.also_supported_by.map(s => s.source_doc_id)).toEqual(['DS']);
    });
  });

  describe('conflicts', () => {
    const oneLaw = (a: Partial<RawRule>, b: Partial<RawRule>) => ({
      docs: [docWith('DA', ['a1']), docWith('DB', ['b1'])],
      extract: rulesFor({ DA: [{ tag: 'a1', title: 'LAW', ...a }], DB: [{ tag: 'b1', title: 'LAW', ...b }] })
    });
    const together = (req: GroupRequest): GroupAnswer => ({ groups: [{ member_ids: req.candidates.map(c => c.id), primary_id: req.candidates[0].id }] });

    it('flags different effective dates and names both dates and documents', async () => {
      const p = paths(); const { docs, extract } = oneLaw({ effective_date: '2026-03-01' }, { effective_date: '2026-01-01' });
      await runCompile({}, { ...p, client: fakeClient(extract, undefined, together).client, docs });
      const [rule] = readRuleStore(p.ruleStorePath);
      expect(rule.conflict_flag).toBe(true);
      for (const needle of ['2026-03-01', '2026-01-01', 'DA', 'DB']) expect(rule.conflict_note).toContain(needle);
    });

    it('does not flag a differing key_value alone', async () => {
      const p = paths(); const { docs, extract } = oneLaw({ key_value: '2 months' }, { key_value: '1 month' });
      await runCompile({}, { ...p, client: fakeClient(extract, undefined, together).client, docs });
      const [rule] = readRuleStore(p.ruleStorePath);
      expect(rule).toMatchObject({ conflict_flag: false, conflict_note: null });
    });

    it('flags different legal statuses of verified members', async () => {
      const p = paths(); const { docs, extract } = oneLaw({ legal_status: 'enacted' }, { legal_status: 'pending' });
      await runCompile({}, { ...p, client: fakeClient(extract, undefined, together).client, docs });
      const [rule] = readRuleStore(p.ruleStorePath);
      expect(rule.conflict_flag).toBe(true);
      expect(rule.conflict_note).toContain('legal_status');
    });
  });

  describe('caching', () => {
    const docs = () => [docWith('D1', ['a1', 'a2', 'b1']), docWith('D2', ['c1'], { origin: 'supplemental' })];
    const specs = { D1: [{ tag: 'a1', title: 'FCHA' }, { tag: 'a2', title: 'FCHA' }, { tag: 'b1', title: 'OTHER' }], D2: [{ tag: 'c1', title: 'FCHA' }] };

    it('a second identical run makes zero model calls and writes identical files', async () => {
      const p = paths();
      await runCompile({}, { ...p, client: fakeClient(rulesFor(specs), undefined, byLaw).client, docs: docs() });
      const [cands, rules] = [readFileSync(path.join(p.root, 'candidates.jsonl'), 'utf8'), readFileSync(p.ruleStorePath, 'utf8')];
      const second = fakeClient(rulesFor(specs), undefined, byLaw);
      const report = await runCompile({}, { ...p, client: second.client, docs: docs() });
      expect(second.calls()).toBe(0);
      expect(report.llm_calls).toBe(0);
      expect(readFileSync(path.join(p.root, 'candidates.jsonl'), 'utf8')).toBe(cands);
      expect(readFileSync(p.ruleStorePath, 'utf8')).toBe(rules);
    });

    it('ingesting one new document re-groups only its cell and leaves other cells byte-identical', async () => {
      const p = paths();
      const other = (tag: string, title: string) => rawRule({ category: 'security_deposits', title, citation: `Cite ${tag}`, quoted_span: sentence(tag) });
      const extract = (req: { doc: { doc_id: string } }) => req.doc.doc_id === 'D1'
        ? [...rulesFor({ D1: specs.D1 })(req), other('d1', 'DEP'), other('d2', 'DEP')] : [];
      const d1 = docWith('D1', ['a1', 'a2', 'b1', 'd1', 'd2']);
      await runCompile({}, { ...p, client: fakeClient(extract, undefined, byLaw).client, docs: [d1] });
      const depLines = () => readFileSync(p.ruleStorePath, 'utf8').split('\n').filter(l => l.includes('"security_deposits"'));
      const before = depLines();
      expect(before).toHaveLength(1);

      const source = path.join(p.root, 'new.txt');
      writeFileSync(source, `${sentence('n1')}\n`);
      const next = fakeClient(() => [rawRule({ title: 'FCHA n1', citation: 'Cite n1', quoted_span: sentence('n1') })], undefined, byLaw);
      const report = await runCompile({ ingestPath: source }, { ...p, client: next.client, docs: [d1] });
      expect(next.groupCalls).toHaveLength(1);
      expect(next.groupCalls[0].category).toBe('screening_restrictions');
      expect(report.cache_hits).toBeGreaterThanOrEqual(1);
      expect(depLines()).toEqual(before);
      const fcha = readRuleStore(p.ruleStorePath).find(r => r.title.startsWith('FCHA'))!;
      expect(fcha.also_supported_by.length).toBe(2);
    });

    it('offline with an uncached multi-candidate cell makes no call, keeps singletons and reports the cell', async () => {
      const p = paths();
      const warm = fakeClient(rulesFor(specs), undefined, () => { throw new Error('model unavailable'); });
      const first = await runCompile({}, { ...p, client: warm.client, docs: docs() });
      expect(first.docs_failed.map(f => f.doc_id)).toEqual([CELL]);
      const offline = fakeClient(rulesFor(specs), undefined, byLaw);
      const report = await runCompile({ offline: true }, { ...p, client: offline.client, docs: docs() });
      expect(offline.calls()).toBe(0);
      expect(report.docs_failed).toHaveLength(1);
      expect(report.docs_failed[0]).toMatchObject({ doc_id: CELL });
      expect(report.docs_failed[0].error).toContain('offline');
      expect(readRuleStore(p.ruleStorePath)).toHaveLength(4);
    });
  });
});

describe('date resolution across documents of one law (lead amendment)', () => {
  it('takes a date the primary lacks from an agreeing co-member, records where it came from, and never calls that a conflict', async () => {
    const { mergeGroup } = await import('../../../../src/ordinal/compile/merge');
    const base = { verified: true, conflict_flag: false, conflict_note: null, status_basis: null, legal_status: 'enacted', repeal_date: null, also_supported_by: [], source_url: 'u', quoted_span: 'q'.repeat(30), key_value: null, coverage: { requires: [], exempt_if: [], summary: null, exemptions_summary: null } } as never as import('../../../../src/ordinal/contracts').InternalRule;
    const statute = { id: 'D1#1', rule: { ...base, source_doc_id: 'D1', source_origin: 'official_captured' as const, enacted_date: '2025-10-06', effective_date: null } };
    const alert = { id: 'D2#1', rule: { ...base, source_doc_id: 'D2', source_origin: 'supplemental' as const, enacted_date: '2025-10', effective_date: '2026-01-01' } };
    const merged = mergeGroup([statute, alert], 'D1#1');
    expect(merged.source_doc_id).toBe('D1'); expect(merged.effective_date).toBe('2026-01-01'); expect(merged.enacted_date).toBe('2025-10-06');
    expect(merged.status_basis).toContain('effective_date 2026-01-01 from D2'); expect(merged.conflict_flag).toBe(false);
  });
  it('keeps the primary date and flags a conflict when documents state different dates', async () => {
    const { mergeGroup } = await import('../../../../src/ordinal/compile/merge');
    const base = { verified: true, conflict_flag: false, conflict_note: null, status_basis: null, legal_status: 'enacted', enacted_date: null, repeal_date: null, also_supported_by: [], source_url: 'u', quoted_span: 'q'.repeat(30), source_origin: 'official_captured', key_value: null, coverage: { requires: [], exempt_if: [], summary: null, exemptions_summary: null } } as never as import('../../../../src/ordinal/contracts').InternalRule;
    const a = { id: 'D1#1', rule: { ...base, source_doc_id: 'D1', effective_date: '2026-03-01' } };
    const b = { id: 'D2#1', rule: { ...base, source_doc_id: 'D2', effective_date: '2026-01' } };
    const c = { id: 'D3#1', rule: { ...base, source_doc_id: 'D3', effective_date: null } };
    const merged = mergeGroup([a, b, c], 'D3#1');
    expect(merged.effective_date).toBeNull(); expect(merged.conflict_flag).toBe(true); expect(merged.conflict_note).toContain('"2026-01" (D2)'); expect(merged.conflict_note).toContain('"2026-03-01" (D1)');
  });
});

describe('status, dates and coverage across documents of one law (lead amendment after the extraction audit)', () => {
  type R = import('../../../../src/ordinal/contracts').InternalRule;
  const none = { requires: [], exempt_if: [], summary: null, exemptions_summary: null };
  const base = { verified: true, conflict_flag: false, conflict_note: null, status_basis: null, legal_status: 'enacted', enacted_date: null, effective_date: null, repeal_date: null, key_value: null, coverage: none, also_supported_by: [], source_url: 'u', quoted_span: 'q'.repeat(30), source_origin: 'official_captured' } as never as R;
  const cand = (id: string, over: Partial<R>) => ({ id, rule: { ...base, source_doc_id: id.split('#')[0], ...over } as R });
  const merge = async (members: ReturnType<typeof cand>[], pick: string) => (await import('../../../../src/ordinal/compile/merge')).mergeGroup(members, pick);

  it('a draft marked pending plus the adopted code marked enacted is an enacted law with the code\'s dates and no conflict', async () => {
    const merged = await merge([cand('D1#1', { legal_status: 'pending' }), cand('X1#1', { source_origin: 'ingested', enacted_date: '2025-05-22', effective_date: '2025-06-21' })], 'D1#1');
    expect(merged.source_doc_id).toBe('D1'); expect(merged.legal_status).toBe('enacted'); expect(merged.enacted_date).toBe('2025-05-22'); expect(merged.effective_date).toBe('2025-06-21');
    expect(merged.conflict_flag).toBe(false); expect(merged.status_basis).toContain('legal_status enacted from X1');
  });
  it('pending plus failed is failed; enacted against failed, or enacted without any date against pending, is flagged and left with the primary', async () => {
    expect((await merge([cand('D1#1', { legal_status: 'pending' }), cand('D2#1', { legal_status: 'failed' })], 'D1#1')).legal_status).toBe('failed');
    const clash = await merge([cand('D1#1', { enacted_date: '2024-01-01' }), cand('D2#1', { legal_status: 'failed' })], 'D1#1');
    expect(clash.legal_status).toBe('enacted'); expect(clash.conflict_flag).toBe(true); expect(clash.conflict_note).toContain('legal_status differs');
    const undated = await merge([cand('D1#1', { legal_status: 'pending' }), cand('D2#1', {})], 'D1#1');
    expect(undated.legal_status).toBe('pending'); expect(undated.conflict_flag).toBe(true);
  });
  it('does not borrow an effective date when the primary states no enactment, or when the lender describes another enactment', async () => {
    expect((await merge([cand('D1#1', {}), cand('D2#1', { enacted_date: '2025-10-16', effective_date: '2026-01-01' })], 'D1#1')).effective_date).toBeNull();
    expect((await merge([cand('D1#1', { enacted_date: '2019-10-08' }), cand('D2#1', { enacted_date: '2025-10-16', effective_date: '2026-01-01' })], 'D1#1')).effective_date).toBeNull();
    expect((await merge([cand('D1#1', { enacted_date: '2025-10-06' }), cand('D2#1', { effective_date: '2026-01-01' })], 'D1#1')).effective_date).toBe('2026-01-01');
  });
  it('flags effective dates under a year apart and treats dates further apart as different amendments', async () => {
    const near = await merge([cand('D1#1', { effective_date: '2026-02-02' }), cand('D2#1', { effective_date: '2026-01-24' })], 'D1#1');
    expect(near.conflict_flag).toBe(true); expect(near.conflict_note).toContain('"2026-01-24" (D2)');
    const far = await merge([cand('D1#1', { effective_date: '2026-01-01' }), cand('D2#1', { effective_date: '2024-07-01' })], 'D1#1');
    expect(far.conflict_flag).toBe(false); expect(far.effective_date).toBe('2026-01-01');
  });
  it('takes coverage and extra headline values from another document only where the primary is silent', async () => {
    const cutoff = { requires: [{ fact: 'year_built' as const, op: 'lte' as const, date: '1979-06-13', basis: 'certificate_of_occupancy' as const, text: 'on or before June 13, 1979' }], exempt_if: [], summary: 'older buildings', exemptions_summary: null };
    const merged = await merge([cand('D1#1', { key_value: '60% of CPI, at most 7%' }), cand('D2#1', { coverage: cutoff, key_value: '1.6% for 1 Mar 2026 to 28 Feb 2027' })], 'D1#1');
    expect(merged.coverage).toEqual(cutoff); expect(merged.key_value).toBe('60% of CPI, at most 7%; 1.6% for 1 Mar 2026 to 28 Feb 2027'); expect(merged.status_basis).toContain('coverage from D2');
    const own = { requires: [{ fact: 'units' as const, op: 'gte' as const, value: 5, text: 'five or more' }], exempt_if: [], summary: null, exemptions_summary: null };
    expect((await merge([cand('D1#1', { coverage: own }), cand('D2#1', { coverage: cutoff })], 'D1#1')).coverage).toEqual(own);
  });
});

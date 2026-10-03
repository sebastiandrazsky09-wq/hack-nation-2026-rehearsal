import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCompile } from '../../../../src/ordinal/compile';
import { chunkDocument } from '../../../../src/ordinal/compile/chunk';
import { InternalRuleSchema } from '../../../../src/ordinal/contracts';
import { loadOfficialDocs, parseDocHeader, readRuleStore } from '../../../../src/ordinal/corpus';
import { FIXTURE_D065_RULES } from './FIXTURE-model-output-d065';
import { fakeClient, paths, rawRule, sourceDoc } from './helpers';

const QUOTE_A = 'The landlord shall not charge a deposit above the stated maximum amount.';
const DOC_A = sourceDoc({ doc_id: 'DA', text: `SOURCE: https://example.test/DA\nRETRIEVED: 2026-01-01\n\n${QUOTE_A}\n` });

describe('runCompile against the supplied D065 text', () => {
  it('turns a hand-written model output into verified rules with header provenance', async () => {
    const doc = loadOfficialDocs().find(d => d.doc_id === 'D065')!;
    const header = parseDocHeader(doc.text);
    const p = paths();
    const fake = fakeClient(() => FIXTURE_D065_RULES);
    const report = await runCompile({ docs: ['D065'] }, { ...p, client: fake.client, docs: [doc] });
    expect(report).toMatchObject({ docs_requested: 1, docs_processed: 1, docs_failed: [], llm_calls: 1 });
    const rules = readRuleStore(p.ruleStorePath);
    expect(rules.length).toBeGreaterThanOrEqual(1);
    for (const r of rules) {
      expect(InternalRuleSchema.parse(r)).toBeTruthy();
      expect(r.jurisdiction).toBe('NJ');
      expect(r.level).toBe('state');
      expect(r.source_url).toBe(header.source_url);
      expect(r.retrieved_at).toBe(header.retrieved_at);
      expect(r.source_origin).toBe('official_captured');
    }
    expect(rules.every(r => r.verified)).toBe(true);
    const first = rules.find(r => r.title.startsWith('No criminal record'))!;
    expect(first).toBeTruthy();
    expect(first.verification_method).toBe('normalized');
    expect(first.quoted_span).toBe(doc.text.slice(first.span_start!, first.span_end!));
    expect(first.quoted_span).toContain('’');
    expect(first.citation_in_source).toBe(true);
  });
});

describe('quote repair', () => {
  const BAD = 'This sentence is nowhere in the document text at all.';
  it('repairs once, and keeps the rule unverified when the repair fails too', async () => {
    const p = paths();
    const fake = fakeClient(() => [rawRule({ quoted_span: BAD })], () => 'Another sentence that is not in the document either.');
    const report = await runCompile({}, { ...p, client: fake.client, docs: [DOC_A] });
    expect(fake.repairCalls).toHaveLength(1);
    expect(report).toMatchObject({ llm_calls: 2, rules_total: 1, rules_verified: 0, rules_unverified: 1 });
    const [rule] = readRuleStore(p.ruleStorePath);
    expect(rule).toMatchObject({ verified: false, verification_method: 'failed', span_start: null, span_end: null, quoted_span: BAD });
  });

  it('verifies with method "repaired" when the repair returns a real span', async () => {
    const p = paths();
    const fake = fakeClient(() => [rawRule({ quoted_span: BAD })], () => QUOTE_A);
    await runCompile({}, { ...p, client: fake.client, docs: [DOC_A] });
    expect(fake.repairCalls).toHaveLength(1);
    const [rule] = readRuleStore(p.ruleStorePath);
    expect(rule).toMatchObject({ verified: true, verification_method: 'repaired', quoted_span: QUOTE_A });
    expect(DOC_A.text.slice(rule.span_start!, rule.span_end!)).toBe(rule.quoted_span);
  });
});

describe('extraction cache', () => {
  const script = () => fakeClient(() => [rawRule({ quoted_span: QUOTE_A }), rawRule({ citation: 'Sec. 9', title: 'Broken quote', quoted_span: 'Not a sentence of the document, at all.' })]);

  it('makes zero client calls on a second run and writes a byte-identical store', async () => {
    const p = paths();
    const first = script();
    const r1 = await runCompile({}, { ...p, client: first.client, docs: [DOC_A] });
    expect(r1.llm_calls).toBe(2);
    const bytes = readFileSync(p.ruleStorePath, 'utf8');
    const ids = readRuleStore(p.ruleStorePath).map(r => r.team_rule_id);
    const second = script();
    const r2 = await runCompile({}, { ...p, client: second.client, docs: [DOC_A] });
    expect(second.calls()).toBe(0);
    expect(r2).toMatchObject({ llm_calls: 0, cache_hits: 1 });
    expect(readFileSync(p.ruleStorePath, 'utf8')).toBe(bytes);
    expect(readRuleStore(p.ruleStorePath).map(r => r.team_rule_id)).toEqual(ids);
  });

  it('calls the client again when forced', async () => {
    const p = paths();
    await runCompile({}, { ...p, client: script().client, docs: [DOC_A] });
    const again = script();
    await runCompile({ force: true }, { ...p, client: again.client, docs: [DOC_A] });
    expect(again.extractCalls).toHaveLength(1);
  });

  it('offline with an empty cache makes zero calls and lists the document as failed', async () => {
    const p = paths();
    const fake = script();
    const report = await runCompile({ offline: true }, { ...p, client: fake.client, docs: [DOC_A] });
    expect(fake.calls()).toBe(0);
    expect(report.docs_failed).toHaveLength(1);
    expect(report.docs_failed[0].doc_id).toBe('DA');
    expect(report).toMatchObject({ docs_processed: 0, rules_total: 0 });
    expect(existsSync(p.ruleStorePath)).toBe(false);
  });

  it('offline with a warm cache reproduces the store without a client', async () => {
    const p = paths();
    await runCompile({}, { ...p, client: script().client, docs: [DOC_A] });
    const bytes = readFileSync(p.ruleStorePath, 'utf8');
    const prev = process.env.ORDINAL_MODEL; process.env.ORDINAL_MODEL = 'fake-model';
    try {
      const report = await runCompile({ offline: true }, { ...p, docs: [DOC_A] });
      expect(report).toMatchObject({ llm_calls: 0, cache_hits: 1, docs_failed: [] });
    } finally { if (prev === undefined) delete process.env.ORDINAL_MODEL; else process.env.ORDINAL_MODEL = prev; }
    expect(readFileSync(p.ruleStorePath, 'utf8')).toBe(bytes);
  });
});

describe('jurisdiction and merging', () => {
  it('drops a rule whose jurisdiction is not allowed and reports it', async () => {
    const p = paths();
    const fake = fakeClient(() => [rawRule({ jurisdiction: 'TX', quoted_span: QUOTE_A }), rawRule({ jurisdiction: 'NJ', citation: 'Sec. 2', title: 'Kept', quoted_span: QUOTE_A })]);
    const report = await runCompile({}, { ...p, client: fake.client, docs: [DOC_A] });
    expect(report.docs_failed).toHaveLength(1);
    expect(report.docs_failed[0]).toMatchObject({ doc_id: 'DA' });
    expect(report.docs_failed[0].error).toContain('"TX"');
    expect(readRuleStore(p.ruleStorePath).map(r => r.title)).toEqual(['Kept']);
  });

  it('accepts the parent state for a city document', async () => {
    const p = paths();
    const cityDoc = sourceDoc({ doc_id: 'DC', jurisdiction: 'Hoboken, NJ', text: DOC_A.text });
    const fake = fakeClient(() => [rawRule({ jurisdiction: 'NJ', quoted_span: QUOTE_A })]);
    await runCompile({}, { ...p, client: fake.client, docs: [cityDoc] });
    expect(fake.extractCalls[0].allowedJurisdictions).toEqual(['Hoboken, NJ', 'NJ']);
    expect(readRuleStore(p.ruleStorePath)[0]).toMatchObject({ jurisdiction: 'NJ', level: 'state' });
  });

  it('merges one rule from two documents and flags differing effective dates', async () => {
    const p = paths();
    const text = (id: string) => `SOURCE: https://example.test/${id}\nRETRIEVED: 2026-01-01\n\n${QUOTE_A}\n`;
    const official = sourceDoc({ doc_id: 'D2', text: text('D2') });
    const supplemental = sourceDoc({ doc_id: 'D1', origin: 'supplemental', text: text('D1') });
    const fake = fakeClient(req => [rawRule({ quoted_span: QUOTE_A, effective_date: req.doc.doc_id === 'D2' ? '2022-01-01' : '2022-07-01' })]);
    await runCompile({}, { ...p, client: fake.client, docs: [supplemental, official] });
    const rules = readRuleStore(p.ruleStorePath);
    expect(rules).toHaveLength(1);
    const [rule] = rules;
    expect(rule.source_doc_id).toBe('D2');
    expect(rule.source_origin).toBe('official_captured');
    expect(rule.also_supported_by.map(s => s.source_doc_id)).toEqual(['D1']);
    expect(rule.conflict_flag).toBe(true);
    for (const needle of ['2022-01-01', '2022-07-01', 'D1', 'D2']) expect(rule.conflict_note).toContain(needle);
  });

  it('keeps rules of other documents when a subset is recompiled', async () => {
    const p = paths();
    const docB = sourceDoc({ doc_id: 'DB', text: 'The landlord must return the deposit within thirty days of move-out.\n' });
    const fake = fakeClient(req => [rawRule({ citation: req.doc.doc_id, title: req.doc.doc_id, quoted_span: req.doc.doc_id === 'DA' ? QUOTE_A : 'The landlord must return the deposit within thirty days of move-out.' })]);
    await runCompile({}, { ...p, client: fake.client, docs: [DOC_A, docB] });
    const docsInStore = () => readRuleStore(p.ruleStorePath).map(r => r.source_doc_id).sort();
    expect(docsInStore()).toEqual(['DA', 'DB']);
    await runCompile({ docs: ['DA'] }, { ...p, client: fake.client, docs: [DOC_A, docB] });
    expect(docsInStore()).toEqual(['DA', 'DB']);
  });
});

describe('ingest', () => {
  it('copies the file, takes the jurisdiction from the model output and leaves other documents alone', async () => {
    const p = paths();
    const quote = 'Operators of rental software shall not set rents using shared nonpublic data.';
    const source = path.join(p.root, 'new-law.txt');
    const body = `Rental Pricing Ordinance\n\nSec. 4. ${quote}\n`;
    writeFileSync(source, body);
    const base = fakeClient(() => [rawRule({ quoted_span: QUOTE_A })]);
    await runCompile({}, { ...p, client: base.client, docs: [DOC_A] });

    const fake = fakeClient(() => [rawRule({ jurisdiction: 'Hoboken, NJ', category: 'algorithmic_rent_setting', citation: 'Sec. 4', title: 'No shared-data pricing', quoted_span: quote })]);
    const report = await runCompile({ ingestPath: source }, { ...p, client: fake.client, docs: [DOC_A] });
    expect(report).toMatchObject({ docs_requested: 1, docs_processed: 1, docs_failed: [] });
    expect(fake.extractCalls).toHaveLength(1);
    expect(fake.extractCalls[0].allowedJurisdictions).toEqual([]);
    expect(fake.extractCalls[0].doc.doc_id).toMatch(/^X[0-9a-f]{7}$/);
    const stored = readdirCopy(p.ingestDir, fake.extractCalls[0].doc.doc_id);
    expect(readFileSync(stored, 'utf8')).toBe(body);

    const rules = readRuleStore(p.ruleStorePath);
    expect(rules.map(r => r.source_origin).sort()).toEqual(['ingested', 'official_captured']);
    const ingested = rules.find(r => r.source_origin === 'ingested')!;
    expect(ingested).toMatchObject({ jurisdiction: 'Hoboken, NJ', level: 'city', verified: true, verification_method: 'exact', source_url: 'ingested:new-law.txt' });
    expect(ingested.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ingested.team_rule_id).toMatch(/^NJ-HOBOKEN-ALG-/);
  });

  it('rejects a model jurisdiction that does not look like a jurisdiction', async () => {
    const p = paths();
    const source = path.join(p.root, 'x.txt'); writeFileSync(source, `${QUOTE_A}\n`);
    const fake = fakeClient(() => [rawRule({ jurisdiction: 'somewhere nice', quoted_span: QUOTE_A })]);
    const report = await runCompile({ ingestPath: source }, { ...p, client: fake.client, docs: [] });
    expect(report.docs_failed).toHaveLength(1);
    expect(report.rules_total).toBe(0);
  });

  it('uses ingestJurisdiction when given', async () => {
    const p = paths();
    const source = path.join(p.root, 'y.txt'); writeFileSync(source, `${QUOTE_A}\n`);
    const fake = fakeClient(() => [rawRule({ jurisdiction: 'CA', quoted_span: QUOTE_A })]);
    await runCompile({ ingestPath: source, ingestJurisdiction: 'Berkeley, CA' }, { ...p, client: fake.client, docs: [] });
    expect(fake.extractCalls[0].allowedJurisdictions).toEqual(['Berkeley, CA', 'CA']);
    expect(readRuleStore(p.ruleStorePath)[0].jurisdiction).toBe('CA');
  });
});

function readdirCopy(dir: string, docId: string): string {
  const file = path.join(dir, `${docId}_new-law.txt`);
  expect(existsSync(file)).toBe(true);
  return file;
}

describe('long documents', () => {
  it('splits at the chunk limit and verifies a quote from the second chunk against full-document offsets', async () => {
    const p = paths();
    const paragraphs = Array.from({ length: 220 }, (_, i) => `Paragraph ${i}. ` + 'Tenants are protected in ordinary circumstances. '.repeat(5));
    const text = paragraphs.join('\n\n') + '\n';
    expect(text.length).toBeGreaterThan(24000);
    const doc = sourceDoc({ doc_id: 'DL', text });
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(1);
    const late = paragraphs[paragraphs.length - 3].slice(0, 80);
    const fake = fakeClient(req => req.chunkText.includes(late) && req.chunkIndex > 0 ? [rawRule({ quoted_span: late })] : []);
    await runCompile({}, { ...p, client: fake.client, docs: [doc] });
    expect(fake.extractCalls.map(c => c.chunkIndex)).toEqual(chunks.map(c => c.index));
    fake.extractCalls.forEach((c, i) => expect(text.slice(chunks[i].start, chunks[i].start + c.chunkText.length)).toBe(c.chunkText));
    const [rule] = readRuleStore(p.ruleStorePath);
    expect(rule.verified).toBe(true);
    expect(rule.span_start).toBeGreaterThan(chunks[1].start);
    expect(text.slice(rule.span_start!, rule.span_end!)).toBe(rule.quoted_span);
  });
});

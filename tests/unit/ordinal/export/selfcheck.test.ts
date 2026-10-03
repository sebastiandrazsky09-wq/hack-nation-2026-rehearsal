import { afterEach, describe, expect, it } from 'vitest';
import { applyAddress } from '../../../../src/ordinal/apply';
import type { ApplyResult } from '../../../../src/ordinal/contracts';
import type { ApplyAddress } from '../../../../src/ordinal/entrypoints';
import { runSelfcheck, type SelfcheckDeps } from '../../../../src/ordinal/selfcheck';
import { baseDeps, cleanTempDirs, makeDoc, makeExportRule, stackFor, tempDir } from './helpers';

afterEach(cleanTempDirs);

const clean = (over: Partial<SelfcheckDeps> = {}): SelfcheckDeps => ({
  ...baseDeps([makeExportRule('r-ca', 'CA'), makeExportRule('r-la', 'Los Angeles, CA', { category: 'just_cause_eviction' })]),
  cacheDir: tempDir(), manifest: [], ...over
});
const fakeResult = (address_id: string, team_rule_id: string, result: ApplyResult['result']): ApplyResult => ({ address_id, team_rule_id, result, reason_code: 'covered', missing_facts: [], caveats: [], explanation: 'forced', conflict_flag: false, conflict_note: null });

describe('selfcheck', () => {
  it('passes on a clean fixture and reports every metric', async () => {
    const report = await runSelfcheck(clean());
    expect(report.failures).toEqual([]); expect(report.ok).toBe(true);
    expect(Object.keys(report.metrics).sort()).toEqual([
      'addresses_resolved', 'addresses_total', 'conflicts', 'empty_cells', 'ingested_docs', 'lookup_addresses', 'lookup_rows', 'official_docs_expected', 'official_docs_processed',
      'resolve_methods', 'result_counts', 'rules_by_category', 'rules_by_jurisdiction', 'rules_citation_not_in_source', 'rules_exported', 'rules_supplemental_only',
      'rules_total', 'rules_unverified', 'rules_verified', 'rules_withheld', 'schema_errors', 'supplemental_docs_available', 'supplemental_docs_processed'
    ]);
    expect(report.metrics).toMatchObject({ rules_total: 2, rules_exported: 2, rules_withheld: 0, addresses_total: 2, addresses_resolved: 2, lookup_addresses: 2, lookup_rows: 2, schema_errors: 0, rules_supplemental_only: 0 });
    expect(JSON.parse(report.metrics.rules_by_jurisdiction as string)).toEqual({ CA: 1, 'Los Angeles, CA': 1 });
    expect(JSON.parse(report.metrics.empty_cells as string)).toContain('NJ|security_deposits');
    expect(JSON.parse(report.metrics.empty_cells as string)).not.toContain('CA|rent_increase_limits');
  });

  it('counts processed documents from the extraction cache or a citing rule', async () => {
    const cacheDir = tempDir();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${cacheDir}/k1.json`, JSON.stringify({ doc_id: 'D1', chunk_index: 0 }));
    writeFileSync(`${cacheDir}/bad.json`, '{not json');
    const manifest = [{ doc_id: 'D1', status: 'ok', text_file: 'a.txt' }, { doc_id: 'DOC', status: 'ok', text_file: 'b.txt' }, { doc_id: 'D3', status: 'ok', text_file: 'c.txt' }, { doc_id: 'D4', status: 'link_only', text_file: '' }] as never;
    const docs = [makeDoc(), makeDoc({ doc_id: 'S1', origin: 'supplemental' }), makeDoc({ doc_id: 'X1', origin: 'ingested' })];
    const { metrics } = await runSelfcheck(clean({ cacheDir, manifest, docs }));
    expect(metrics).toMatchObject({ official_docs_expected: 3, official_docs_processed: 2, supplemental_docs_available: 1, supplemental_docs_processed: 0, ingested_docs: 1 });
  });

  it('fails when zero rules are exported', async () => {
    const report = await runSelfcheck(clean({ rules: [] }));
    expect(report.ok).toBe(false); expect(report.failures).toContain('zero rules exported');
  });

  it('fails when a pending rule is made to apply by a faulty engine', async () => {
    const rules = [makeExportRule('r-ca', 'CA'), makeExportRule('r-pending', 'CA', { category: 'just_cause_eviction', legal_status: 'pending', enacted_date: null, effective_date: null })];
    const apply: ApplyAddress = (rs, a, s, asOf) => applyAddress(rs, a, s, asOf).map(r => (r.team_rule_id === 'r-pending' ? { ...r, result: 'applies' as const } : r));
    const report = await runSelfcheck(clean({ rules, apply }));
    expect(report.ok).toBe(false);
    expect(report.failures.some(f => /pending or failed rule.*r-pending is pending but has result applies/.test(f))).toBe(true);
    expect(report.failures.some(f => /"applies" result for rule.*r-pending \(pending\)/.test(f))).toBe(true);
    expect((await runSelfcheck(clean({ rules }))).ok).toBe(true);
  });

  it('fails on an unresolved stack', async () => {
    const base = clean();
    const report = await runSelfcheck({ ...base, stacks: { ...base.stacks, B1: stackFor('B1', { method: 'unresolved', legal_city: null, confidence: 0 }) } });
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.stringMatching(/^1 unresolved jurisdiction stack\(s\): B1/));
    expect(report.metrics).toMatchObject({ addresses_resolved: 1 });
  });

  it('fails when a lookup row points at a withheld rule', async () => {
    const rules = [makeExportRule('r-ca', 'CA'), makeExportRule('r-bad', 'CA', { category: 'just_cause_eviction', verified: false, verification_method: 'failed' })];
    const apply: ApplyAddress = (rs, a, s, asOf) => [...applyAddress(rs, a, s, asOf), fakeResult(a.address_id, 'r-bad', 'unknown')];
    const report = await runSelfcheck(clean({ rules, apply }));
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.stringMatching(/not exported: B1->r-bad, B2->r-bad/));
    expect(report.metrics).toMatchObject({ rules_withheld: 1, rules_unverified: 1 });
  });

  it('fails on a schema error and on a missing address stack', async () => {
    const short = 'too short quote'; const doc = makeDoc({ text: `SOURCE: u\n${short}\n` }); const start = doc.text.indexOf(short);
    const rules = [makeExportRule('r-short', 'CA', { quoted_span: short, span_start: start, span_end: start + short.length })];
    const base = clean({ rules, docs: [doc] });
    const report = await runSelfcheck({ ...base, stacks: { B1: stackFor('B1') } });
    expect(report.failures.some(f => /^2 schema error\(s\)/.test(f))).toBe(true);
    expect(report.metrics.schema_errors).toBe(2);
  });

  it('fails when two exports differ', async () => {
    let calls = 0;
    const apply: ApplyAddress = (rs, a, s, asOf) => applyAddress(rs, a, s, asOf).map(r => ({ ...r, explanation: `${r.explanation} #${calls++}` }));
    const report = await runSelfcheck(clean({ apply }));
    expect(report.failures).toContainEqual(expect.stringMatching(/^two exports of the same inputs differ in: lookups\.json/));
  });
});

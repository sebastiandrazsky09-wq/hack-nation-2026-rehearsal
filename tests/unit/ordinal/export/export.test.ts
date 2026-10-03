import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { afterEach, describe, expect, it } from 'vitest';
import type { CoverageSpec } from '../../../../src/ordinal/contracts';
import { runExport } from '../../../../src/ordinal/export';
import { unavailable } from '../engine/helpers';
import { QUOTE, SCHEMA_PATH, addressFor, baseDeps, cleanTempDirs, makeDoc, makeExportRule, readJson, readText, stackFor, tempDir } from './helpers';

afterEach(cleanTempDirs);

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const spec = (requires: CoverageSpec['requires']): CoverageSpec => ({ requires, exempt_if: [], summary: null, exemptions_summary: null });
const exportTo = async (deps: ReturnType<typeof baseDeps>, asOf?: string) => { const outDir = tempDir(); const report = await runExport({ asOf, outDir }, deps); return { outDir, report }; };

describe('rules.json', () => {
  it('every record validates against the official schema, carries exactly the schema keys, and status follows asOf', async () => {
    const rules = [
      makeExportRule('r-b', 'CA', { effective_date: '2027-07-01', coverage: { requires: [], exempt_if: [], summary: 'All buildings', exemptions_summary: 'None' } }),
      makeExportRule('r-a', 'Los Angeles, CA', { category: 'just_cause_eviction' }),
      makeExportRule('r-c', 'NJ', { legal_status: 'pending', enacted_date: null, effective_date: null })
    ];
    const before = await exportTo(baseDeps(rules), '2026-10-01');
    const after = await exportTo(baseDeps(rules), '2027-07-02');
    const validate = new Ajv2020({ strict: false }).compile(schema);
    for (const run of [before, after]) {
      const { rules: records } = readJson(run.outDir, 'rules.json');
      expect(records.map((r: { team_rule_id: string }) => r.team_rule_id)).toEqual(['r-a', 'r-b', 'r-c']);
      for (const record of records) { expect(validate(record), JSON.stringify(validate.errors)).toBe(true); expect(Object.keys(record).sort()).toEqual(Object.keys(schema.properties).sort()); }
      expect(run.report.schema_errors).toEqual([]);
    }
    const status = (run: typeof before, id: string) => readJson(run.outDir, 'rules.json').rules.find((r: { team_rule_id: string }) => r.team_rule_id === id).status;
    expect(status(before, 'r-b')).toBe('not_yet_effective');
    expect(status(after, 'r-b')).toBe('in_force');
    expect(status(after, 'r-c')).toBe('pending');
    const row = (run: typeof before) => readJson(run.outDir, 'lookups.json').lookups.B1.find((r: { team_rule_id: string }) => r.team_rule_id === 'r-b').result;
    expect(row(before)).toBe('not_yet_effective');
    expect(row(after)).toBe('applies');
    expect(readJson(before.outDir, 'lookups.json').as_of).toBe('2026-10-01');
    const record = readJson(before.outDir, 'rules.json').rules.find((r: { team_rule_id: string }) => r.team_rule_id === 'r-b');
    expect(record).toMatchObject({ coverage_conditions: 'All buildings', exemptions: 'None', source_doc_id: 'DOC', quoted_span: QUOTE });
  });

  it('withholds an unverified rule and a verified rule whose document text changed, and counts both', async () => {
    const rules = [
      makeExportRule('r-ok', 'CA'),
      makeExportRule('r-unverified', 'CA', { verified: false, verification_method: 'failed' }),
      makeExportRule('r-stale', 'CA', { source_doc_id: 'OTHER' }),
      makeExportRule('r-missing-doc', 'CA', { source_doc_id: 'GONE' })
    ];
    const docs = [makeDoc(), makeDoc({ doc_id: 'OTHER', text: makeDoc().text.replace('five percent', 'ten percent') })];
    const { outDir, report } = await exportTo(baseDeps(rules, { docs }));
    expect(report).toMatchObject({ rules: 1, rules_withheld_unverified: 3, schema_errors: [] });
    for (const name of ['rules.json', 'lookups.json']) for (const id of ['r-unverified', 'r-stale', 'r-missing-doc']) expect(readText(outDir, name)).not.toContain(id);
    expect(readJson(outDir, 'audit.json').withheld).toEqual([
      { team_rule_id: 'r-missing-doc', reason: 'source_document_missing' },
      { team_rule_id: 'r-stale', reason: 'quote_does_not_match_source' },
      { team_rule_id: 'r-unverified', reason: 'not_verified' }
    ]);
  });

  it('fills overrides and interaction for a yielding state rule and its city rule, and leaves unrelated rules empty', async () => {
    const rules = [
      makeExportRule('r-state', 'CA', { precedence: { relation: 'yields_to_stricter_local', text: 'x' } }),
      makeExportRule('r-city-b', 'San Diego, CA'),
      makeExportRule('r-city-a', 'Los Angeles, CA'),
      makeExportRule('r-city-other-cat', 'Los Angeles, CA', { category: 'security_deposits' }),
      makeExportRule('r-nj-city', 'Newark, NJ'),
      makeExportRule('r-state-plain', 'CA', { category: 'security_deposits' }),
      makeExportRule('r-nj-preempt', 'NJ', { category: 'just_cause_eviction', precedence: { relation: 'preempts_local', text: 'y' } }),
      makeExportRule('r-nj-city-jc', 'Newark, NJ', { category: 'just_cause_eviction' })
    ];
    const { outDir } = await exportTo(baseDeps(rules));
    const byId = Object.fromEntries(readJson(outDir, 'rules.json').rules.map((r: { team_rule_id: string }) => [r.team_rule_id, r]));
    expect(byId['r-state']).toMatchObject({ overrides: ['r-city-a', 'r-city-b'], interaction: 'Yields to a stricter local rule where one applies.' });
    expect(byId['r-city-a']).toMatchObject({ overrides: ['r-state'], interaction: 'A state rule of this category yields to this local rule.' });
    expect(byId['r-city-b']).toMatchObject({ overrides: ['r-state'] });
    expect(byId['r-nj-preempt']).toMatchObject({ overrides: ['r-nj-city-jc'], interaction: 'Its text bars conflicting local ordinances; flagged for review.' });
    expect(byId['r-nj-city-jc']).toMatchObject({ overrides: ['r-nj-preempt'], interaction: 'A state rule of this category bars conflicting local ordinances; flagged for review.' });
    for (const id of ['r-city-other-cat', 'r-nj-city', 'r-state-plain']) expect(byId[id]).toMatchObject({ overrides: [], interaction: null });
  });

  it('reports a schema-invalid record in schema_errors but still writes the files', async () => {
    const short = 'too short quote';
    const doc = makeDoc({ text: `SOURCE: https://example.test/doc\n${short}\n` });
    const start = doc.text.indexOf(short);
    const rules = [makeExportRule('r-short', 'CA', { quoted_span: short, span_start: start, span_end: start + short.length })];
    const { outDir, report } = await exportTo(baseDeps(rules, { docs: [doc] }));
    expect(report.schema_errors).toHaveLength(1);
    expect(report.schema_errors[0]).toMatch(/^r-short: .*quoted_span/);
    expect(readJson(outDir, 'rules.json').rules).toHaveLength(1);
  });
});

describe('lookups.json', () => {
  it('has a key for every address, omits not_applicable, keeps the open results, and rows hold exactly four keys', async () => {
    const rules = [
      makeExportRule('r-1-state', 'CA', { precedence: { relation: 'yields_to_stricter_local', text: 'x' } }),
      makeExportRule('r-2-city', 'Los Angeles, CA'),
      makeExportRule('r-3-unknown', 'CA', { category: 'security_deposits', coverage: spec([unavailable('owner_type')]) }),
      makeExportRule('r-4-pending', 'CA', { category: 'just_cause_eviction', legal_status: 'pending', enacted_date: null, effective_date: null }),
      makeExportRule('r-5-nye', 'CA', { category: 'application_screening_fees', effective_date: '2027-07-01' }),
      makeExportRule('r-6-nj', 'NJ', { category: 'screening_restrictions' })
    ];
    const { outDir, report } = await exportTo(baseDeps(rules));
    const { lookups } = readJson(outDir, 'lookups.json');
    expect(Object.keys(lookups)).toEqual(['B1', 'B2']);
    const results = Object.fromEntries(lookups.B1.map((r: { team_rule_id: string; result: string }) => [r.team_rule_id, r.result]));
    expect(results).toEqual({ 'r-1-state': 'superseded', 'r-2-city': 'applies', 'r-3-unknown': 'unknown', 'r-4-pending': 'pending', 'r-5-nye': 'not_yet_effective' });
    expect(lookups.B2.map((r: { team_rule_id: string }) => r.team_rule_id)).toEqual(['r-6-nj']);
    for (const row of Object.values(lookups).flat() as object[]) expect(Object.keys(row).sort()).toEqual(['conflict_flag', 'explanation', 'result', 'team_rule_id']);
    expect(report.lookup_rows).toBe(6);
    expect(report.addresses).toBe(2);
  });

  it('gives an address with no matching rule an empty list and an address with no stack a schema error', async () => {
    const deps = baseDeps([makeExportRule('r-ca', 'CA')], { addresses: [addressFor('B1'), addressFor('B3', { state: 'MA' }), addressFor('B4')], stacks: { B1: stackFor('B1'), B3: stackFor('B3', { state: 'MA', legal_city: null }) } });
    const { outDir, report } = await exportTo(deps);
    const { lookups } = readJson(outDir, 'lookups.json');
    expect(lookups.B3).toEqual([]); expect(lookups.B4).toEqual([]);
    expect(report.schema_errors).toEqual(['B4: no jurisdiction stack']);
  });
});

describe('determinism', () => {
  it('two exports of the same inputs are byte-identical and audit.json has no timestamp or absolute path', async () => {
    const rules = [makeExportRule('r-b', 'CA', { also_supported_by: [{ source_doc_id: 'Z2', source_url: 'u', quoted_span: 'q', verified: true }, { source_doc_id: 'Z1', source_url: 'u', quoted_span: 'q', verified: true }] }), makeExportRule('r-a', 'Los Angeles, CA')];
    const one = await exportTo(baseDeps(rules)); const two = await exportTo(baseDeps([...rules].reverse()));
    for (const name of ['rules.json', 'lookups.json', 'audit.json']) expect(readText(one.outDir, name), name).toBe(readText(two.outDir, name));
    const audit = readText(one.outDir, 'audit.json');
    expect(audit).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(audit).not.toContain(one.outDir); expect(audit).not.toContain(process.cwd()); expect(audit).not.toMatch(/"\/|\\\\/);
    expect(audit.endsWith('}\n')).toBe(true);
    const parsed = JSON.parse(audit);
    expect(parsed.rules.find((r: { team_rule_id: string }) => r.team_rule_id === 'r-b').also_supported_by).toEqual(['Z1', 'Z2']);
    expect(Object.keys(parsed.inputs)).toEqual(['rule_store_sha256', 'stacks_sha256', 'addresses_sha256']);
    expect(parsed.result_counts).toEqual({ applies: 2 });
  });
});

describe('source hygiene', () => {
  it('export, selfcheck and apply sources hold no test, rule or address ids', () => {
    const root = path.join(__dirname, '../../../../src/ordinal');
    for (const dir of ['export', 'selfcheck', 'apply']) {
      for (const f of readdirSync(path.join(root, dir))) expect(readFileSync(path.join(root, dir, f), 'utf8'), f).not.toMatch(/\bT[1-6]\b|\bA0\d{3}\b|\bD0\d{2}\b|\br-0\d{3}\b/);
    }
  });
});

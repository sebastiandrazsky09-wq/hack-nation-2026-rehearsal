import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { deriveStatus, dateFloor, dateCeil } from '../../../src/ordinal/status';
import { loadAddresses, loadManifest, loadOfficialDocs, loadSupplementalDocs, parseCsv, PATHS } from '../../../src/ordinal/corpus';
import { CATEGORIES, levelOf, stateOf } from '../../../src/ordinal/contracts';

describe('status derivation', () => {
  const enacted = { legal_status: 'enacted' as const, effective_date: '2027-07-01', repeal_date: null };
  it('flips from not_yet_effective to in_force on the effective date', () => {
    expect(deriveStatus(enacted, '2026-10-01')).toBe('not_yet_effective');
    expect(deriveStatus(enacted, '2027-06-30')).toBe('not_yet_effective');
    expect(deriveStatus(enacted, '2027-07-01')).toBe('in_force');
    expect(deriveStatus(enacted, '2027-07-02')).toBe('in_force');
  });
  it('never lets pending or failed become in force, whatever the dates say', () => {
    expect(deriveStatus({ legal_status: 'pending', effective_date: '2020-01-01', repeal_date: null }, '2026-10-01')).toBe('pending');
    expect(deriveStatus({ legal_status: 'failed', effective_date: '2020-01-01', repeal_date: null }, '2026-10-01')).toBe('failed');
  });
  it('treats a missing effective date as in force and a partial date as its first day', () => {
    expect(deriveStatus({ legal_status: 'enacted', effective_date: null, repeal_date: null }, '2026-10-01')).toBe('in_force');
    expect(deriveStatus({ legal_status: 'enacted', effective_date: '2026', repeal_date: null }, '2025-12-31')).toBe('not_yet_effective');
    expect(deriveStatus({ legal_status: 'enacted', effective_date: '2026', repeal_date: null }, '2026-01-01')).toBe('in_force');
    expect(dateFloor('2027-07')).toBe('2027-07-01'); expect(dateCeil('2028-02')).toBe('2028-02-29'); expect(dateCeil('2027')).toBe('2027-12-31');
  });
  it('rejects a malformed query date', () => { expect(() => deriveStatus(enacted, '2026-13-45x')).toThrow('YYYY-MM-DD'); });
});

describe('official pack loaders', () => {
  it('loads the manifest, the supplied texts and all 500 addresses', () => {
    const manifest = loadManifest(); const docs = loadOfficialDocs(); const addresses = loadAddresses();
    expect(manifest).toHaveLength(87); expect(docs).toHaveLength(54); expect(addresses).toHaveLength(500);
    expect(new Set(addresses.map(a => a.address_id)).size).toBe(500);
    expect(addresses.filter(a => a.year_built === null)).toHaveLength(212);
    expect(addresses.filter(a => a.units === null)).toHaveLength(242);
    for (const doc of docs) {
      expect(doc.origin).toBe('official_captured'); expect(doc.source_url).toMatch(/^https?:/); expect(doc.retrieved_at).toBeTruthy();
      expect(doc.jurisdiction).toBeTruthy(); expect(['state', 'city']).toContain(levelOf(doc.jurisdiction!)); expect(['CA', 'NJ', 'MA']).toContain(stateOf(doc.jurisdiction!));
    }
  });
  it('keeps supplemental captures separate from the supplied corpus', () => {
    const official = new Set(loadOfficialDocs().map(d => d.doc_id));
    for (const doc of loadSupplementalDocs()) { expect(doc.origin).toBe('supplemental'); expect(official.has(doc.doc_id)).toBe(false); expect(doc.path.startsWith('supplemental/')).toBe(true); }
  });
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });
  it('compiles the official rule schema and accepts the official sample record', () => {
    const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(PATHS.ruleSchema, 'utf8')));
    const sample = JSON.parse(readFileSync(PATHS.pack + '/schema/sample_rule_record.json', 'utf8'));
    expect(validate(sample)).toBe(true);
    expect(validate({ ...sample, category: 'parking' })).toBe(false);
    expect(validate({ ...sample, quoted_span: 'too short' })).toBe(false);
    expect(JSON.parse(readFileSync(PATHS.ruleSchema, 'utf8')).properties.category.enum).toEqual([...CATEGORIES]);
  });
});

describe('PROOF review regressions', () => {
  it('rejects impossible calendar dates', async () => {
    const { PartialDateSchema, IsoDateSchema } = await import('../../../src/ordinal/contracts');
    for (const bad of ['2026-02-31', '2026-04-31', '2026-00', '2026-13', '2025-02-29', '26-01-01']) expect(PartialDateSchema.safeParse(bad).success, bad).toBe(false);
    for (const good of ['2026', '2026-02', '2028-02-29', '2027-07-01']) expect(PartialDateSchema.safeParse(good).success, good).toBe(true);
    expect(IsoDateSchema.safeParse('2026-07').success).toBe(false);
    expect(() => deriveStatus({ legal_status: 'enacted', effective_date: null, repeal_date: null }, '2026-02-31')).toThrow('YYYY-MM-DD');
  });
  it('reports an enacted law as pending before its enactment date', () => {
    const fair = { legal_status: 'enacted' as const, enacted_date: '2026-07-20', effective_date: '2027-07-01', repeal_date: null };
    expect(deriveStatus(fair, '2026-07-19')).toBe('pending');
    expect(deriveStatus(fair, '2026-07-20')).toBe('not_yet_effective');
    expect(deriveStatus(fair, '2027-07-02')).toBe('in_force');
  });
  it('does not read a header value from the next line', async () => {
    const { parseDocHeader } = await import('../../../src/ordinal/corpus');
    expect(parseDocHeader('SOURCE:\nRETRIEVED: 2026-10-01\nbody')).toEqual({ source_url: null, retrieved_at: '2026-10-01' });
    expect(parseDocHeader('SOURCE: https://x.test/a\nRETRIEVED:\nBody text')).toEqual({ source_url: 'https://x.test/a', retrieved_at: null });
  });
  it('rejects malformed CSV instead of inventing fields', () => {
    expect(() => parseCsv('a,b\n1,"unterminated')).toThrow('unterminated');
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow('row 2');
    expect(parseCsv('a,b\n1,\n')).toEqual([{ a: '1', b: '' }]);
  });
  it('refuses a store that claims verification without a matching span', async () => {
    const { assertRuleInvariants, quoteMatchesSource } = await import('../../../src/ordinal/corpus');
    const quote = 'A security deposit may not exceed one and one-half months rent.';
    const base = { team_rule_id: 'r', quoted_span: quote } as never as import('../../../src/ordinal/contracts').InternalRule;
    expect(() => assertRuleInvariants({ ...base, verified: true, verification_method: 'failed', span_start: null, span_end: null })).toThrow('verified=true');
    expect(() => assertRuleInvariants({ ...base, verified: true, verification_method: 'exact', span_start: 0, span_end: 5 })).toThrow('verified=true');
    expect(() => assertRuleInvariants({ ...base, verified: false, verification_method: 'exact', span_start: null, span_end: null })).toThrow('verified=false');
    const ok = assertRuleInvariants({ ...base, verified: true, verification_method: 'exact', span_start: 4, span_end: 4 + quote.length });
    expect(quoteMatchesSource(ok, 'xxxx' + quote + ' more')).toBe(true);
    expect(quoteMatchesSource(ok, 'xxxx' + quote.replace('deposit', 'payment') + ' more')).toBe(false);
  });
});

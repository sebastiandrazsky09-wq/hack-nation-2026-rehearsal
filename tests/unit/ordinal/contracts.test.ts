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

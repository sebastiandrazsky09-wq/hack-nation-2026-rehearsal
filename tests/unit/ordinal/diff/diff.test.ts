import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Address, InternalRule, JurisdictionStack } from '../../../../src/ordinal/contracts';
import { computeChanges, resolveJurisdiction, runDiff } from '../../../../src/ordinal/diff';
import type { ChangeCase } from '../../../../src/ordinal/entrypoints';
import { makeAddress, makeRule, makeStack } from '../engine/helpers';
import { cleanTempDirs, tempDir } from '../export/helpers';

afterEach(cleanTempDirs);

const CITIES = ['Hoboken, NJ', 'Jersey City, NJ', 'Newark, NJ', 'Boston, MA', 'Cambridge, MA', 'Los Angeles, CA'];
const addresses: Address[] = []; const stacks: Record<string, JurisdictionStack> = {};
const add = (id: string, state: string, city: string | null) => {
  addresses.push(makeAddress({ address_id: id, state })); stacks[id] = makeStack({ address_id: id, state, legal_city: city });
};
add('CA1', 'CA', 'Los Angeles, CA'); add('CA2', 'CA', null);
add('NJ1', 'NJ', 'Hoboken, NJ'); add('NJ2', 'NJ', 'Jersey City, NJ'); add('NJ3', 'NJ', 'Newark, NJ');
add('MA1', 'MA', 'Boston, MA'); add('MA2', 'MA', 'Cambridge, MA');

const alg = { category: 'algorithmic_rent_setting' as const };
const rule = (id: string, jurisdiction: string, over: Partial<InternalRule> = {}) => makeRule({ team_rule_id: id, jurisdiction, ...alg, ...over });
const rules: InternalRule[] = [
  rule('ca-alg', 'CA', { enacted_date: '2025-10-06', effective_date: '2026-01-01' }),
  rule('hob-alg', 'Hoboken, NJ'), rule('jc-alg', 'Jersey City, NJ'),
  rule('nj-alg', 'NJ', { enacted_date: '2026-01-01', effective_date: '2027-07-01', precedence: { relation: 'preempts_local', text: 'bars local' } }),
  rule('ma-alg-enacted', 'MA'),
  rule('ma-alg-p1', 'MA', { legal_status: 'pending', enacted_date: null, effective_date: null, source_doc_id: 'DOC-P1' }),
  rule('ma-alg-p2', 'MA', { legal_status: 'pending', enacted_date: null, effective_date: null, source_doc_id: 'DOC-P2', also_supported_by: [{ source_doc_id: 'DOC-ALSO', source_url: 'u', quoted_span: 'q', verified: true }] }),
  rule('ma-rent-failed', 'MA', { category: 'rent_increase_limits', legal_status: 'failed', enacted_date: null, effective_date: null, title: 'Rent cap ballot question' })
];
const run = (cases: ChangeCase[], asOf = '2026-10-01') => computeChanges(cases, rules, addresses, stacks, asOf);
const one = (c: ChangeCase) => { const out = run([c]); return { ...out.results[0], errors: out.errors }; };
const ids = (state: string) => addresses.filter(a => a.state === state).map(a => a.address_id);

describe('computeChanges', () => {
  it('as_of: affected = every address of the state whose result changes between the dates', () => {
    const r = one({ test_id: 'a', type: 'as_of', rule_ids: ['CA-ALG-01'], as_of_before: '2025-12-31', as_of_after: '2026-01-02', states: ['CA'] });
    expect(r.counts['2025-12-31']).toEqual({ not_yet_effective: 2 });
    expect(r.counts['2026-01-02']).toEqual({ applies: 2 });
    expect(r.affected_address_ids).toEqual(ids('CA'));
    expect(r.conflict_flag_address_ids).toEqual([]);
  });

  it('boundary: city labels select only the city rules', () => {
    const r = one({ test_id: 'b', type: 'boundary', rule_ids: ['HOB-ALG-01', 'JC-ALG-01'], as_of: '2026-10-01' });
    expect(r.selected).toEqual([{ selector: 'HOB-ALG-01', team_rule_ids: ['hob-alg'] }, { selector: 'JC-ALG-01', team_rule_ids: ['jc-alg'] }]);
    expect(r.affected_address_ids).toEqual(['NJ1', 'NJ2']);
  });

  it('future effective date with preemption flags exactly the addresses with a city rule', () => {
    const r = one({ test_id: 'c', type: 'as_of', rule_ids: ['NJ-ALG-01'], as_of_before: '2026-10-01', as_of_after: '2027-07-02', states: ['NJ'], conflict_with: ['x'] });
    expect(r.affected_address_ids).toEqual(ids('NJ'));
    expect(r.conflict_flag_address_ids).toEqual(['NJ1', 'NJ2']);
    expect(r.notes).toContain('flags come from the engine only');
  });

  it('pending: P labels select the pending rules only', () => {
    const r = one({ test_id: 'd', type: 'pending', rule_ids: ['MA-ALG-P1', 'MA-ALG-P2'], as_of: '2026-10-01', states: ['MA'] });
    expect(r.selected.map(s => s.team_rule_ids)).toEqual([['ma-alg-p1', 'ma-alg-p2'], ['ma-alg-p1', 'ma-alg-p2']]);
    expect(r.affected_address_ids).toEqual(ids('MA'));
    expect(r.counts['2026-10-01']).toEqual({ pending: 4 });
  });

  it('negative: a failed proposal affects nothing and the notes say it failed', () => {
    const r = one({ test_id: 'e', type: 'negative', rule_ids: ['MA-RENT-P1'], as_of: '2026-10-01', states: ['MA'] });
    expect(r.selected[0].team_rule_ids).toEqual(['ma-rent-failed']);
    expect(r.affected_address_ids).toEqual([]);
    expect(r.conflict_flag_address_ids).toEqual([]);
    expect(r.notes).toContain('failed');
  });

  it('selects by team_rule_ids and by source_doc_ids, including also_supported_by', () => {
    const r = one({ test_id: 'f', type: 'boundary', team_rule_ids: ['hob-alg'], source_doc_ids: ['DOC-ALSO', 'DOC-P1'] });
    expect(r.selected).toEqual([
      { selector: 'hob-alg', team_rule_ids: ['hob-alg'] },
      { selector: 'DOC-ALSO', team_rule_ids: ['ma-alg-p2'] },
      { selector: 'DOC-P1', team_rule_ids: ['ma-alg-p1'] }
    ]);
    expect(r.affected_address_ids).toEqual(['MA1', 'MA2', 'NJ1']);
  });

  it('unresolvable selectors give an empty set plus an error, without throwing', () => {
    const out = run([{ test_id: 'g', type: 'boundary', rule_ids: ['ZZ-ALG-01', 'NJ-RENT-01', 'garbage'], team_rule_ids: ['nope'], as_of: '2026-10-01' }]);
    expect(out.results[0].affected_address_ids).toEqual([]);
    expect(out.results[0].selected.every(s => s.team_rule_ids.length === 0)).toBe(true);
    expect(out.results[0].notes).toContain('ZZ-ALG-01 resolved to no rule');
    expect(out.errors).toEqual(expect.arrayContaining(['g: ZZ-ALG-01 resolved to no rule', 'g: NJ-RENT-01 resolved to no rule', 'g: nope resolved to no rule']));
  });
});

describe('resolveJurisdiction', () => {
  it('resolves state codes, city initials and unique prefixes', () => {
    const extra = [rule('x', 'Santa Ana, CA'), rule('y', 'San Diego, CA'), rule('z', 'San Francisco, CA'), rule('w', 'Berkeley, CA')];
    const all = [...rules, ...extra];
    const expected: Record<string, string> = {
      JC: 'Jersey City, NJ', LA: 'Los Angeles, CA', SF: 'San Francisco, CA', SD: 'San Diego, CA', SA: 'Santa Ana, CA', HOB: 'Hoboken, NJ',
      CAM: 'Cambridge, MA', BOS: 'Boston, MA', BER: 'Berkeley, CA', CA: 'CA', NJ: 'NJ', MA: 'MA'
    };
    for (const [code, jurisdiction] of Object.entries(expected)) expect(resolveJurisdiction(code, all), code).toBe(jurisdiction);
  });
  it('an ambiguous or unknown prefix resolves to nothing', () => {
    expect(resolveJurisdiction('SAN', rules)).toBeNull();
    expect(resolveJurisdiction('ZZ', rules)).toBeNull();
  });
});

describe('runDiff', () => {
  const cases: ChangeCase[] = [
    { test_id: 'T2', type: 'boundary', rule_ids: ['JC-ALG-01', 'HOB-ALG-01'], as_of: '2026-10-01' },
    { test_id: 'T1', type: 'as_of', rule_ids: ['CA-ALG-01'], as_of_before: '2025-12-31', as_of_after: '2026-01-02', states: ['CA'] }
  ];
  it('writes all three keys per case with sorted ids, byte-identical on a second run', async () => {
    const dir = tempDir();
    const deps = { cases, rules, stacks, addresses: [...addresses].reverse() };
    const report = await runDiff({ outDir: dir }, deps);
    const first = readFileSync(path.join(dir, 'changes.json'), 'utf8');
    await runDiff({ outDir: dir }, deps);
    expect(readFileSync(path.join(dir, 'changes.json'), 'utf8')).toBe(first);
    const body = JSON.parse(first);
    expect(Object.keys(body)).toEqual(['T1', 'T2']);
    for (const entry of Object.values<Record<string, unknown>>(body)) expect(Object.keys(entry)).toEqual(['affected_address_ids', 'conflict_flag_address_ids', 'notes']);
    expect(body.T2.affected_address_ids).toEqual(['NJ1', 'NJ2']);
    expect(first.endsWith('}\n')).toBe(true);
    expect(report.summary.T1).toEqual({ affected: 2, conflict_flagged: 0, rules: ['ca-alg'] });
  });
  it('an extra-cases file adds a case; the same id replaces with an error', async () => {
    const dir = tempDir(); const official = path.join(dir, 'official.json'); const extra = path.join(dir, 'extra.json');
    writeFileSync(official, JSON.stringify(cases));
    writeFileSync(extra, JSON.stringify([{ test_id: 'X1', type: 'boundary', team_rule_ids: ['hob-alg'] }]));
    const report = await runDiff({ outDir: dir }, { casesFile: official, extraCasesFile: extra, rules, stacks, addresses });
    expect(Object.keys(JSON.parse(readFileSync(report.file, 'utf8')))).toEqual(['T1', 'T2', 'X1']);
    expect(report.errors).toEqual([]);
    writeFileSync(extra, JSON.stringify([{ test_id: 'T1', type: 'boundary', team_rule_ids: ['hob-alg'] }]));
    const again = await runDiff({ outDir: dir }, { casesFile: official, extraCasesFile: extra, rules, stacks, addresses });
    expect(again.errors).toEqual(['T1: extra case replaces the official case with the same id']);
    expect(again.summary.T1.rules).toEqual(['hob-alg']);
  });
});

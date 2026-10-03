import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { InternalRule, JurisdictionStack } from '../../../../src/ordinal/contracts';
import type { SourceDoc } from '../../../../src/ordinal/corpus';
import type { ExportDeps } from '../../../../src/ordinal/export';
import { makeAddress, makeRule, makeStack } from '../engine/helpers';

export const SCHEMA_PATH = path.join(__dirname, '../../../../official/pack/schema/rule_record.schema.json');
export const QUOTE = 'The landlord shall not raise the rent by more than five percent in any year.';
export const DOC_TEXT = `SOURCE: https://example.test/doc\nRETRIEVED: 2026-10-01\n${QUOTE}\nSecond paragraph of the document.\n`;
export const makeDoc = (over: Partial<SourceDoc> = {}): SourceDoc => ({
  doc_id: 'DOC', jurisdiction: null, source_url: 'https://example.test/doc', retrieved_at: '2026-10-01', origin: 'official_captured', path: 'fixture/doc.txt', text: DOC_TEXT, ...over
});

/** A rule whose quote is the literal slice of DOC_TEXT, so it verifies against makeDoc(). */
export function makeExportRule(team_rule_id: string, jurisdiction: string, over: Partial<InternalRule> = {}): InternalRule {
  const start = DOC_TEXT.indexOf(QUOTE);
  return makeRule({ team_rule_id, jurisdiction, quoted_span: QUOTE, span_start: start, span_end: start + QUOTE.length, retrieved_at: '2026-10-01', ...over });
}

export const stackFor = (address_id: string, over: Partial<JurisdictionStack> = {}) => makeStack({ address_id, ...over });
export const addressFor = (address_id: string, over = {}) => makeAddress({ address_id, ...over });

/** Two addresses: one in Los Angeles, one in Newark. */
export function baseDeps(rules: InternalRule[], over: ExportDeps = {}): ExportDeps {
  return {
    rules, docs: [makeDoc()], schemaPath: SCHEMA_PATH,
    addresses: [addressFor('B2', { state: 'NJ' }), addressFor('B1')],
    stacks: { B1: stackFor('B1'), B2: stackFor('B2', { state: 'NJ', legal_city: 'Newark, NJ' }) },
    ...over
  };
}

const dirs: string[] = [];
export const tempDir = () => { const dir = mkdtempSync(path.join(tmpdir(), 'ordinal-test-')); dirs.push(dir); return dir; };
export const cleanTempDirs = () => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); };
export const readJson = (dir: string, name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
export const readText = (dir: string, name: string) => readFileSync(path.join(dir, name), 'utf8');

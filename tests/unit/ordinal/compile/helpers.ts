import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourceDoc } from '../../../../src/ordinal/corpus';
import type { ExtractRequest, LlmClient, RawRule, RepairRequest } from '../../../../src/ordinal/compile';

export const tempDir = () => mkdtempSync(path.join(tmpdir(), 'ordinal-compile-'));

export function paths(root = tempDir()) {
  return { root, ruleStorePath: path.join(root, 'rules.jsonl'), cacheDir: path.join(root, 'extraction'), ingestDir: path.join(root, 'ingested') };
}

export const emptyCoverage = { requires: [], exempt_if: [], summary: null, exemptions_summary: null };

export function rawRule(over: Partial<RawRule> & Pick<RawRule, 'quoted_span'>): RawRule {
  return {
    jurisdiction: 'NJ', category: 'screening_restrictions', title: 'Test rule', requirement: 'A test requirement.',
    key_value: null, penalty: null, citation: 'Sec. 12-34', legal_status: 'enacted', enacted_date: null, effective_date: null, repeal_date: null,
    status_basis: null, coverage: emptyCoverage, precedence: { relation: 'none_stated', text: null }, confidence: 0.9,
    conflict_flag: false, conflict_note: null, ...over
  };
}

export function sourceDoc(over: Partial<SourceDoc> & Pick<SourceDoc, 'doc_id' | 'text'>): SourceDoc {
  return { jurisdiction: 'NJ', source_url: `https://example.test/${over.doc_id}`, retrieved_at: '2026-01-01', origin: 'official_captured', path: `memory/${over.doc_id}.txt`, ...over };
}

/** Scripted client: counts every call and answers from the callbacks. */
export function fakeClient(extract: (req: ExtractRequest) => RawRule[], repair: (req: RepairRequest) => string = req => req.rule.quoted_span) {
  const extractCalls: ExtractRequest[] = []; const repairCalls: RepairRequest[] = [];
  const client: LlmClient = {
    model: 'fake-model',
    async extract(req) { extractCalls.push(req); return { rules: extract(req), model: 'fake-model' }; },
    async repair(req) { repairCalls.push(req); return { quoted_span: repair(req) }; }
  };
  return { client, extractCalls, repairCalls, calls: () => extractCalls.length + repairCalls.length };
}

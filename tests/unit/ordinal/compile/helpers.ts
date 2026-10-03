import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourceDoc } from '../../../../src/ordinal/corpus';
import type { ExtractRequest, GroupAnswer, GroupRequest, LlmClient, RawRule, RepairRequest } from '../../../../src/ordinal/compile';

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

/** Default grouping: candidates with the same citation are one law; the first of each is the primary. */
export const groupByCitation = (req: GroupRequest): GroupAnswer => {
  const byCitation = new Map<string, string[]>();
  for (const c of req.candidates) byCitation.set(c.citation, [...(byCitation.get(c.citation) ?? []), c.id]);
  return { groups: [...byCitation.values()].map(ids => ({ member_ids: ids, primary_id: ids[0] })) };
};

/** Scripted client: counts every call and answers from the callbacks. */
export function fakeClient(extract: (req: ExtractRequest) => RawRule[], repair: (req: RepairRequest) => string = req => req.rule.quoted_span, group: (req: GroupRequest) => GroupAnswer = groupByCitation) {
  const extractCalls: ExtractRequest[] = []; const repairCalls: RepairRequest[] = []; const groupCalls: GroupRequest[] = [];
  const client: LlmClient = {
    model: 'fake-model',
    async extract(req) { extractCalls.push(req); return { rules: extract(req), model: 'fake-model' }; },
    async repair(req) { repairCalls.push(req); return { quoted_span: repair(req) }; },
    async group(req) { groupCalls.push(req); return group(req); }
  };
  return { client, extractCalls, repairCalls, groupCalls, calls: () => extractCalls.length + repairCalls.length + groupCalls.length };
}

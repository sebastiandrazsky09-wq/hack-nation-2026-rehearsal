// Candidates are what one document yielded, before consolidation. They live beside the rule store.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { InternalRuleSchema, type InternalRule } from '../contracts';
import { assertRuleInvariants } from '../corpus';
import type { Candidate } from './merge';

export const candidatesPath = (ruleStorePath: string) => path.join(path.dirname(ruleStorePath), 'candidates.jsonl');

const LineSchema = z.object({ candidate_id: z.string(), rule: InternalRuleSchema });

/** "<doc_id>#<n>", n from 1 in order of span_start (unverified last) then quoted_span. */
export function numberCandidates(docId: string, rules: InternalRule[]): Candidate[] {
  const order = (r: InternalRule) => [r.span_start ?? Infinity, r.quoted_span, r.jurisdiction, r.category, r.citation, r.title] as const;
  return [...rules]
    .sort((a, b) => {
      const [x, y] = [order(a), order(b)];
      if (x[0] !== y[0]) return x[0] < y[0] ? -1 : 1;
      for (let i = 1; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
      return 0;
    })
    .map((rule, i) => ({ id: `${docId}#${i + 1}`, rule }));
}

export function readCandidates(file: string): Candidate[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
    const parsed = LineSchema.parse(JSON.parse(line));
    return { id: parsed.candidate_id, rule: assertRuleInvariants(parsed.rule) };
  });
}

/** Sorted by candidate id so the file is byte-identical for identical candidates. */
export function writeCandidates(candidates: Candidate[], file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = [...candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  writeFileSync(file, sorted.map(c => JSON.stringify({ candidate_id: c.id, rule: assertRuleInvariants(InternalRuleSchema.parse(c.rule)) })).join('\n') + (sorted.length ? '\n' : ''));
}

// Lead-owned. The one place the web app reads the committed store. No model call happens at request time.
import { loadAddresses, loadOfficialDocs, loadSupplementalDocs, quoteMatchesSource, readRuleStore, readStacks, PATHS, type SourceDoc } from '../ordinal/corpus';
import { loadIngestedDocs } from '../ordinal/compile/ingest';
import { existsSync, readFileSync } from 'node:fs';
import { applyAddress } from '../ordinal/apply/index';
import { computeChanges } from '../ordinal/diff/index';
import type { ChangeCase, ChangeResult } from '../ordinal/entrypoints';
import { deriveStatus } from '../ordinal/status';
import { DEFAULT_AS_OF, isRealPartialDate, type Address, type ApplyResult, type InternalRule, type JurisdictionStack } from '../ordinal/contracts';

export const DISCLAIMER = 'Not legal advice. A prototype that reads public law; check the cited source before acting.';
type Dataset = { rules: InternalRule[]; withheld: number; addresses: Address[]; stacks: Record<string, JurisdictionStack>; docs: Map<string, SourceDoc> };
let cached: Dataset | null = null;
/** Only rules whose stored quote is still the literal slice of its source document are served. */
export function dataset(): Dataset {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  const docs = new Map([...loadOfficialDocs(), ...loadSupplementalDocs(), ...loadIngestedDocs(PATHS.ingested)].map(d => [d.doc_id, d]));
  const all = readRuleStore();
  const rules = all.filter(r => { const doc = docs.get(r.source_doc_id); return doc !== undefined && quoteMatchesSource(r, doc.text); });
  cached = { rules, withheld: all.length - rules.length, addresses: loadAddresses(), stacks: readStacks(), docs };
  return cached;
}
export function parseAsOf(value: string | null): string | null {
  const asOf = value ?? DEFAULT_AS_OF;
  return asOf.length === 10 && isRealPartialDate(asOf) ? asOf : null;
}
/** What the interface shows for a rule: the official record fields plus provenance. */
export function ruleView(rule: InternalRule, asOf: string) {
  return {
    team_rule_id: rule.team_rule_id, jurisdiction: rule.jurisdiction, level: rule.level, category: rule.category, status: deriveStatus(rule, asOf),
    title: rule.title, requirement: rule.requirement, key_value: rule.key_value, penalty: rule.penalty, citation: rule.citation,
    legal_status: rule.legal_status, enacted_date: rule.enacted_date, effective_date: rule.effective_date,
    coverage_conditions: rule.coverage.summary, exemptions: rule.coverage.exemptions_summary,
    source_doc_id: rule.source_doc_id, source_url: rule.source_url, source_origin: rule.source_origin, retrieved_at: rule.retrieved_at,
    quoted_span: rule.quoted_span, verification_method: rule.verification_method, confidence: rule.confidence,
    conflict_flag: rule.conflict_flag, conflict_note: rule.conflict_note,
    also_supported_by: rule.also_supported_by.map(s => ({ source_doc_id: s.source_doc_id, source_url: s.source_url }))
  };
}
export type RuleView = ReturnType<typeof ruleView>;
export type LookupResponse = {
  as_of: string; disclaimer: string; address: Address; stack: JurisdictionStack;
  results: (ApplyResult & { rule: RuleView })[]; not_applicable: number;
};
export function lookup(addressId: string, asOf: string): LookupResponse | null {
  const { rules, addresses, stacks } = dataset();
  const address = addresses.find(a => a.address_id === addressId); const stack = stacks[addressId];
  if (!address || !stack) return null;
  const byId = new Map(rules.map(r => [r.team_rule_id, r]));
  const all = applyAddress(rules, address, stack, asOf);
  const shown = all.filter(r => r.result !== 'not_applicable');
  return { as_of: asOf, disclaimer: DISCLAIMER, address, stack, results: shown.map(r => ({ ...r, rule: ruleView(byId.get(r.team_rule_id)!, asOf) })), not_applicable: all.length - shown.length };
}

export type ChangesResponse = { as_of: string; disclaimer: string; cases: (ChangeResult & { expected_behavior: string | null })[]; errors: string[] };
/** The official change cases plus any added after kickoff, evaluated by the same engine as the lookups. */
export function changes(asOf: string): ChangesResponse {
  const { rules, addresses, stacks } = dataset();
  const read = (file: string): ChangeCase[] => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as ChangeCase[] : [];
  const byId = new Map([...read(PATHS.changeTests), ...read(PATHS.extraCases)].map(c => [c.test_id, c]));
  const cases = [...byId.values()];
  const { results, errors } = computeChanges(cases, rules, addresses, stacks, asOf);
  results.sort((a, b) => a.test_id < b.test_id ? -1 : 1);
  return { as_of: asOf, disclaimer: DISCLAIMER, cases: results.map(r => ({ ...r, expected_behavior: byId.get(r.test_id)?.expected_behavior ?? null })), errors };
}

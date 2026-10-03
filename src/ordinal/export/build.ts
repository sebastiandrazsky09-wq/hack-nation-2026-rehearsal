// Builds the submission files in memory. Pure given its inputs: no clock, no absolute paths, sorted everywhere,
// so identical inputs give byte-identical files. Writing is left to the caller.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020Module from 'ajv/dist/2020';
import { applyAddress } from '../apply';
import { levelOf, stateOf, type Address, type ApplyResult, type InternalRule, type JurisdictionStack } from '../contracts';
import { PATHS, loadAddresses, loadOfficialDocs, loadSupplementalDocs, quoteMatchesSource, readRuleStore, readStacks, type SourceDoc } from '../corpus';
import { loadIngestedDocs } from '../compile/ingest';
import type { ApplyAddress } from '../entrypoints';
import { assertIsoDate, deriveStatus } from '../status';

export type ExportDeps = {
  rules?: InternalRule[];
  stacks?: Record<string, JurisdictionStack>;
  addresses?: Address[];
  docs?: SourceDoc[];
  schemaPath?: string;
  /** Replaces the engine; only tests that need a faulty engine use it. */
  apply?: ApplyAddress;
};

export type LookupRow = { team_rule_id: string; result: ApplyResult['result']; explanation: string; conflict_flag: boolean };
export type Withheld = { team_rule_id: string; reason: string };
export type BuildResult = {
  asOf: string;
  addresses: Address[];
  exported: InternalRule[];
  withheld: Withheld[];
  lookups: Record<string, LookupRow[]>;
  lookupRows: number;
  resultCounts: Record<string, number>;
  schemaErrors: string[];
  /** File name -> exact bytes. */
  files: Record<string, string>;
};

export const EXPORT_FILES = ['rules.json', 'lookups.json', 'audit.json'] as const;

// ajv/dist/2020 is CommonJS: depending on the loader the class is the module or its `default`.
const Ajv2020 = ((Ajv2020Module as unknown as { default?: typeof Ajv2020Module }).default ?? Ajv2020Module) as typeof Ajv2020Module;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const countBy = (items: string[]) => Object.fromEntries([...new Set(items)].sort(cmp).map(k => [k, items.filter(i => i === k).length]));

const RELATIONS = ['yields_to_stricter_local', 'preempts_local'] as const;
const isLocalLinked = (rule: InternalRule) => (RELATIONS as readonly string[]).includes(rule.precedence.relation);
const STATE_SENTENCE: Record<string, string> = {
  yields_to_stricter_local: 'Yields to a stricter local rule where one applies.',
  preempts_local: 'Its text bars conflicting local ordinances; flagged for review.'
};
const CITY_SENTENCE: Record<string, string> = {
  yields_to_stricter_local: 'A state rule of this category yields to this local rule.',
  preempts_local: 'A state rule of this category bars conflicting local ordinances; flagged for review.'
};

/** overrides and interaction come from the rules' own precedence text only. */
function links(rule: InternalRule, all: InternalRule[]): { overrides: string[]; interaction: string | null } {
  const ids = (rules: InternalRule[]) => rules.map(r => r.team_rule_id).sort(cmp);
  if (levelOf(rule.jurisdiction) === 'state') {
    if (!isLocalLinked(rule)) return { overrides: [], interaction: null };
    const overrides = ids(all.filter(c => levelOf(c.jurisdiction) === 'city' && c.category === rule.category && stateOf(c.jurisdiction) === rule.jurisdiction));
    return { overrides, interaction: overrides.length ? STATE_SENTENCE[rule.precedence.relation] : null };
  }
  const states = all.filter(s => levelOf(s.jurisdiction) === 'state' && s.category === rule.category && s.jurisdiction === stateOf(rule.jurisdiction) && isLocalLinked(s));
  if (!states.length) return { overrides: [], interaction: null };
  return { overrides: ids(states), interaction: RELATIONS.filter(rel => states.some(s => s.precedence.relation === rel)).map(rel => CITY_SENTENCE[rel]).join(' ') };
}

function toRecord(rule: InternalRule, asOf: string, all: InternalRule[]) {
  const { overrides, interaction } = links(rule, all);
  return {
    team_rule_id: rule.team_rule_id, jurisdiction: rule.jurisdiction, level: rule.level, category: rule.category,
    status: deriveStatus(rule, asOf), title: rule.title, requirement: rule.requirement, key_value: rule.key_value,
    coverage_conditions: rule.coverage.summary, exemptions: rule.coverage.exemptions_summary, overrides, interaction,
    effective_date: rule.effective_date, citation: rule.citation, source_doc_id: rule.source_doc_id, source_url: rule.source_url,
    quoted_span: rule.quoted_span, confidence: rule.confidence, conflict_flag: rule.conflict_flag, conflict_note: rule.conflict_note
  };
}

/** Verified, and the quote is still the literal slice of the document it cites. Anything else is withheld. */
function splitExportable(rules: InternalRule[], docs: SourceDoc[]): { exported: InternalRule[]; withheld: Withheld[] } {
  const byId = new Map<string, SourceDoc>();
  for (const doc of docs) if (!byId.has(doc.doc_id)) byId.set(doc.doc_id, doc);
  const exported: InternalRule[] = []; const withheld: Withheld[] = [];
  for (const rule of [...rules].sort((a, b) => cmp(a.team_rule_id, b.team_rule_id))) {
    const doc = byId.get(rule.source_doc_id);
    if (!rule.verified) withheld.push({ team_rule_id: rule.team_rule_id, reason: 'not_verified' });
    else if (!doc) withheld.push({ team_rule_id: rule.team_rule_id, reason: 'source_document_missing' });
    else if (!quoteMatchesSource(rule, doc.text)) withheld.push({ team_rule_id: rule.team_rule_id, reason: 'quote_does_not_match_source' });
    else exported.push(rule);
  }
  return { exported, withheld };
}

export function buildExport(asOf: string, deps: ExportDeps = {}): BuildResult {
  assertIsoDate(asOf);
  const rules = deps.rules ?? readRuleStore();
  const stacks = deps.stacks ?? readStacks();
  const addresses = [...(deps.addresses ?? loadAddresses())].sort((a, b) => cmp(a.address_id, b.address_id));
  const docs = deps.docs ?? [...loadOfficialDocs(), ...loadSupplementalDocs(), ...loadIngestedDocs(PATHS.ingested)];
  const apply = deps.apply ?? applyAddress;
  const { exported, withheld } = splitExportable(rules, docs);

  const records = exported.map(rule => toRecord(rule, asOf, exported));
  const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(deps.schemaPath ?? PATHS.ruleSchema, 'utf8')));
  const schemaErrors: string[] = [];
  for (const record of records) {
    const id = record.team_rule_id;
    if (!validate(record)) schemaErrors.push(`${id}: ${(validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  }

  const lookups: Record<string, LookupRow[]> = {};
  for (const address of addresses) {
    const stack = stacks[address.address_id];
    if (!stack) { schemaErrors.push(`${address.address_id}: no jurisdiction stack`); lookups[address.address_id] = []; continue; }
    lookups[address.address_id] = apply(exported, address, stack, asOf)
      .filter(r => r.result !== 'not_applicable')
      .map(r => ({ team_rule_id: r.team_rule_id, result: r.result, explanation: r.explanation, conflict_flag: r.conflict_flag }))
      .sort((a, b) => cmp(a.team_rule_id, b.team_rule_id));
  }
  const rows = Object.values(lookups).flat();
  const resultCounts = countBy(rows.map(r => r.result));

  const audit = {
    as_of: asOf,
    inputs: {
      rule_store_sha256: sha256([...rules].sort((a, b) => cmp(a.team_rule_id, b.team_rule_id))),
      stacks_sha256: sha256(Object.keys(stacks).sort(cmp).map(id => stacks[id])),
      addresses_sha256: sha256(addresses)
    },
    rules: exported.map(r => ({
      team_rule_id: r.team_rule_id, source_doc_id: r.source_doc_id, source_origin: r.source_origin, source_url: r.source_url, retrieved_at: r.retrieved_at,
      verification_method: r.verification_method, span_start: r.span_start, span_end: r.span_end, also_supported_by: r.also_supported_by.map(a => a.source_doc_id).sort(cmp)
    })),
    withheld, result_counts: resultCounts
  };
  return {
    asOf, addresses, exported, withheld, lookups, lookupRows: rows.length, resultCounts, schemaErrors,
    files: { 'rules.json': json({ rules: records }), 'lookups.json': json({ as_of: asOf, lookups }), 'audit.json': json(audit) }
  };
}

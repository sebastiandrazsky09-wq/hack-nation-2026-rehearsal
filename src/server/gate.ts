import { DEFAULT_AS_OF } from '../ordinal/contracts';
import { ACTIONS, type CheckRequest } from '../gate/contract';
// Loads everything a decision rests on once and serves it from memory. No model call happens at request time.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadManifest, PATHS } from '../ordinal/corpus';
import type { ChangeCase } from '../ordinal/entrypoints';
import { computeKnownGaps } from '../gate/coverage';
import type { GateData } from '../gate/index';
import { readConstraints, rulesetVersion } from '../gate/store';
import { dataset } from './ordinal';

let cached: GateData | null = null;
/** Rebuilt whenever the rule store or the constraint store changes, which `rulesetVersion()` detects. */
export function gateData(): GateData {
  const version = rulesetVersion();
  if (cached && cached.rulesetVersion === version) return cached;
  const { rules, addresses, stacks, docs } = dataset();
  const manifest = loadManifest();
  const supplementalIds = new Set(manifest.filter(r => existsSync(path.join(PATHS.supplementalText, r.doc_id + '.txt'))).map(r => r.doc_id));
  const cases = existsSync(PATHS.changeTests) ? JSON.parse(readFileSync(PATHS.changeTests, 'utf8')) as ChangeCase[] : [];
  // Verified again at serve time, like the rules: a constraint decides only while its quote is still the literal slice of its
  // source document, its rule is still served, and it belongs to the action its rule's category maps to. Otherwise it is dropped,
  // and a rule left without a constraint can only produce REVIEW.
  const served = new Map(rules.map(r => [r.team_rule_id, r]));
  const constraints = readConstraints().filter(c => {
    const rule = served.get(c.rule_id); const doc = docs.get(c.source_doc_id);
    if (!rule || !doc || rule.source_doc_id !== c.source_doc_id || ACTIONS[c.action].category !== rule.category) return false;
    if (doc.text.slice(c.span_start, c.span_end) !== c.evidence_quote) return false;
    return !c.hard_max_quote || doc.text.includes(c.hard_max_quote);
  });
  cached = { rules, addresses, stacks, constraints, rulesetVersion: version, gaps: computeKnownGaps(rules, cases, manifest, supplementalIds), manifest, supplementalIds };
  return cached;
}

/**
 * The request the Check screen opens with: the algorithmic-pricing action at the first registry property in San Francisco
 * whose record states both year built and units, on the default date. Chosen by attribute; no property id is written here.
 */
export function defaultCheckRequest(): CheckRequest {
  const { addresses, stacks } = gateData();
  const complete = (a: (typeof addresses)[number]) => a.units !== null && a.year_built !== null;
  const property = addresses.find(a => stacks[a.address_id]?.legal_city === 'San Francisco, CA' && complete(a)) ?? addresses.find(complete) ?? addresses[0];
  return { subject: { type: 'property_manager' }, action: { name: 'set_rent_with_pricing_algorithm' }, resource: { type: 'property', id: property.address_id }, context: { as_of: DEFAULT_AS_OF } };
}

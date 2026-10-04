// check() and checkBatch(): look the property up, run the engine over the action's category, hand the results to decide().
import { createHash } from 'node:crypto';
import { applyAddress } from '../ordinal/apply/index';
import type { Address, ApplyResult, Category, InternalRule, JurisdictionStack } from '../ordinal/contracts';
import { DEFAULT_AS_OF } from '../ordinal/contracts';
import type { ManifestRow } from '../ordinal/corpus';
import { DISCLAIMER } from '../server/ordinal';
import { ACTIONS, SUBJECT_NOTE, canonicalRequest, type ActionSpec, type CallerFacts, type CheckBatchRequest, type CheckBatchResponse, type CheckRequest, type CheckResponse, type Constraint, type Decision } from './contract';
import { gapsFor, sourceCounts, type KnownGap } from './coverage';
import { decide, type Decided, type DecideRule } from './decide';
import { overlayFacts } from './facts';
import { GateError } from './http';
import { changePoints, mergeChangePoints, topReason } from './summary';
import { buildTrace } from './trace';

export type GateData = {
  rules: InternalRule[]; addresses: Address[]; stacks: Record<string, JurisdictionStack>;
  constraints: Constraint[]; rulesetVersion: string;
  gaps: KnownGap[]; manifest: ManifestRow[]; supplementalIds: ReadonlySet<string>;
};

type Index = { byAddress: Map<string, Address>; byCategory: Map<Category, InternalRule[]>; constraints: Map<string, Constraint[]> };
const indexes = new WeakMap<GateData, Index>();
function indexOf(data: GateData): Index {
  let index = indexes.get(data);
  if (!index) {
    const byCategory = new Map<Category, InternalRule[]>();
    for (const r of data.rules) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    const constraints = new Map<string, Constraint[]>();
    for (const c of data.constraints) constraints.set(`${c.rule_id}|${c.action}`, [...(constraints.get(`${c.rule_id}|${c.action}`) ?? []), c]);
    index = { byAddress: new Map(data.addresses.map(a => [a.address_id, a])), byCategory, constraints };
    indexes.set(data, index);
  }
  return index;
}

const notInRegistry = (id: string) => new GateError('property_not_in_registry', 404, `Property ${id} is not in the registry.`);

export type Evaluation = {
  decided: Decided; facts: CheckResponse['facts']; stack: JurisdictionStack; address: Address; jurisdictions: string[];
  rules: InternalRule[]; results: Map<string, ApplyResult>; constraints: (rule: InternalRule) => Constraint[]; gaps: KnownGap[];
};

/** One run of the decision function. `check`, `checkBatch` and `envelope` all go through it. */
export function evaluate(data: GateData, spec: ActionSpec, value: number | null, asOf: string, id: string, supplied: CallerFacts | undefined, strict: boolean): Evaluation {
  const index = indexOf(data);
  const record = index.byAddress.get(id); const stack = data.stacks[id];
  if (!record || !stack) throw notInRegistry(id);
  const { address, facts } = overlayFacts(record, supplied, strict);
  const rules = index.byCategory.get(spec.category) ?? [];
  const results = new Map(applyAddress(rules, address, stack, asOf).map(r => [r.team_rule_id, r]));
  const constraints = (rule: InternalRule) => index.constraints.get(`${rule.team_rule_id}|${spec.name}`) ?? [];
  const jurisdictions = [stack.state, ...(stack.legal_city ? [stack.legal_city] : [])];
  const gaps = gapsFor(data.gaps, jurisdictions, spec.category);
  const input: DecideRule[] = rules.map(rule => ({ rule, result: results.get(rule.team_rule_id)!, constraints: constraints(rule) }));
  const decided = decide({ action: spec, value, asOf, rules: input, gaps: gaps.map(g => g.text) });
  return { decided, facts, stack, address, jurisdictions, rules, results, constraints, gaps };
}

const parameterValue = (req: { action: CheckRequest['action'] }, spec: ActionSpec) => (spec.parameter ? req.action.properties?.[spec.parameter.name] ?? null : null);

export function check(request: CheckRequest, data: GateData): CheckResponse {
  const started = performance.now();
  const asOf = request.context?.as_of ?? DEFAULT_AS_OF;
  const spec = ACTIONS[request.action.name];
  const value = parameterValue(request, spec);
  const e = evaluate(data, spec, value, asOf, request.resource.id, request.context?.facts, true);
  const decisionId = 'dec_' + createHash('sha256').update(JSON.stringify(canonicalRequest(request, asOf)) + data.rulesetVersion).digest('hex').slice(0, 16);
  const sources = sourceCounts(data.manifest, e.jurisdictions, data.supplementalIds);
  return {
    ...e.decided,
    decision_id: decisionId, ruleset_version: data.rulesetVersion, as_of: asOf,
    evaluated_ms: performance.now() - started,
    trace: buildTrace(e.rules.map(rule => ({ rule, result: e.results.get(rule.team_rule_id)!, constraints: e.constraints(rule) })), e.address, e.stack, asOf, spec, value),
    facts: e.facts, subject_note: SUBJECT_NOTE,
    coverage: { jurisdictions: e.jurisdictions, category: spec.category, rules_considered: e.rules.length, ...sources, known_gaps: e.gaps.map(g => g.text) },
    change_points: changePoints(e.rules, e.stack.state, e.stack.legal_city),
    disclaimer: DISCLAIMER
  };
}

export function checkBatch(request: CheckBatchRequest, data: GateData): CheckBatchResponse {
  const started = performance.now();
  const asOf = request.context?.as_of ?? DEFAULT_AS_OF;
  const spec = ACTIONS[request.action.name];
  const value = parameterValue(request, spec);
  const index = indexOf(data);
  const ids = request.resources === 'all' ? data.addresses.map(a => a.address_id) : request.resources;
  for (const id of ids) if (!index.byAddress.has(id)) throw notInRegistry(id);

  const counts: Record<Decision, number> = { PASS: 0, BLOCK: 0, REQUIRE: 0, REVIEW: 0 };
  const points: CheckBatchResponse['change_points'][] = []; const seenPlaces = new Set<string>();
  const results = ids.map(id => {
    const e = evaluate(data, spec, value, asOf, id, request.context?.facts, false);
    counts[e.decided.decision]++;
    const place = `${e.stack.state}|${e.stack.legal_city}`;
    if (!seenPlaces.has(place)) { seenPlaces.add(place); points.push(changePoints(e.rules, e.stack.state, e.stack.legal_city)); }
    return {
      id, street_address: e.address.street_address, legal_city: e.stack.legal_city, decision: e.decided.decision,
      top_reason: topReason(e.decided, asOf), determining_rule_ids: [...new Set(e.decided.determining.map(r => r.rule_id))]
    };
  });
  return { counts, evaluated: results.length, evaluated_ms: performance.now() - started, as_of: asOf, ruleset_version: data.rulesetVersion, change_points: mergeChangePoints(points), results, disclaimer: DISCLAIMER };
}

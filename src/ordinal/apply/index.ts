// Pure engine: no I/O, no clock, no randomness. The query date is always an argument.
import { levelOf, stateOf, type ApplyResult, type InternalRule } from '../contracts';
import type { ApplyAddress, ApplyRule } from '../entrypoints';
import { deriveStatus } from '../status';
import { evaluateCoverage } from './coverage';
import { explain, type ReasonCode } from './explain';

export { REASON_CODES, type ReasonCode } from './explain';

const uniqueSorted = (items: string[]) => [...new Set(items)].sort();

function covers(rule: InternalRule, stack: Parameters<ApplyRule>[2]): boolean {
  return levelOf(rule.jurisdiction) === 'state' ? stack.state === rule.jurisdiction : stack.legal_city === rule.jurisdiction;
}

export const applyRule: ApplyRule = (rule, address, stack, asOf) => {
  const base = { address_id: address.address_id, team_rule_id: rule.team_rule_id, conflict_flag: false, conflict_note: null };
  const finish = (result: ApplyResult['result'], code: ReasonCode, o: { deciding?: Parameters<typeof explain>[0]['deciding']; missing?: string[]; caveats?: string[]; open?: boolean } = {}): ApplyResult => {
    const missing = o.missing ?? []; const caveats = o.caveats ?? [];
    return {
      ...base, result, reason_code: code, missing_facts: missing, caveats,
      explanation: explain({ code, rule, stack, asOf, deciding: o.deciding ?? [], missing, caveats }, o.open)
    };
  };

  // Rule 6: an unresolved stack does not know the city, so a city rule of the stack's state cannot be ruled out.
  const cityUnknown = levelOf(rule.jurisdiction) === 'city' && stack.method === 'unresolved' && stateOf(rule.jurisdiction) === stack.state;
  if (!cityUnknown && !covers(rule, stack)) return finish('not_applicable', 'outside_jurisdiction');
  const status = deriveStatus(rule, asOf);
  if (status === 'failed') return finish('not_applicable', 'status_failed');
  if (cityUnknown) return finish('unknown', 'jurisdiction_unresolved', { missing: ['legal_city'] });

  const coverage = evaluateCoverage(rule.coverage, address, asOf);
  const { caveats } = coverage;
  if (coverage.value === false) return finish('not_applicable', coverage.falseBecause!, { deciding: coverage.deciding, caveats });

  const missing = uniqueSorted(coverage.unknowns.flatMap(u => (u.fact ? [u.fact] : [])));
  const open = coverage.value === null;
  if (status === 'pending') return finish('pending', 'status_pending', { deciding: coverage.unknowns, missing, caveats, open });
  if (status === 'not_yet_effective') return finish('not_yet_effective', 'status_not_yet_effective', { deciding: coverage.unknowns, missing, caveats, open });

  if (coverage.value === true) return finish('applies', 'covered', { caveats });
  const kinds = new Set(coverage.unknowns.map(u => u.kind));
  const code: ReasonCode = kinds.has('missing') ? 'missing_fact' : kinds.has('ambiguous') ? 'cutoff_ambiguous' : 'unverifiable_condition';
  return finish('unknown', code, { deciding: coverage.unknowns, missing, caveats });
};

export const applyAddress: ApplyAddress = (rules, address, stack, asOf) => {
  const entries = rules.map(rule => ({ rule, result: applyRule(rule, address, stack, asOf) }));
  entries.sort((a, b) => (a.rule.team_rule_id < b.rule.team_rule_id ? -1 : a.rule.team_rule_id > b.rule.team_rule_id ? 1 : 0));

  const localsOf = (rule: InternalRule) => entries.filter(e => levelOf(e.rule.jurisdiction) === 'city' && e.rule.category === rule.category);
  const notes = new Map<string, string[]>();
  const flag = (id: string, note: string) => notes.set(id, [...(notes.get(id) ?? []), note]);

  // Rule 7a: yields_to_stricter_local.
  for (const e of entries) {
    const { rule, result } = e;
    if (levelOf(rule.jurisdiction) !== 'state' || rule.precedence.relation !== 'yields_to_stricter_local') continue;
    if (result.result !== 'applies' && result.result !== 'unknown') continue;
    const locals = localsOf(rule);
    const applying = locals.find(l => l.result.result === 'applies');
    const undecided = locals.find(l => l.result.result === 'unknown');
    const local = applying ?? (result.result === 'applies' ? undecided : undefined);
    if (!local) continue;
    const code: ReasonCode = applying ? 'superseded_by_local' : 'local_coverage_unknown';
    e.result = {
      ...result, result: applying ? 'superseded' : 'unknown', reason_code: code, missing_facts: [],
      explanation: explain({ code, rule, stack, asOf, deciding: [], missing: [], caveats: result.caveats, local: local.rule })
    };
  }

  // Rule 7b: preempts_local conflicts, at any status.
  for (const e of entries) {
    const { rule, result } = e;
    if (levelOf(rule.jurisdiction) !== 'state' || rule.precedence.relation !== 'preempts_local' || result.result === 'not_applicable') continue;
    for (const local of localsOf(rule)) {
      if (local.result.result === 'not_applicable') continue;
      flag(rule.team_rule_id, `Possible conflict with ${local.rule.title} (${local.rule.jurisdiction}, ${local.rule.team_rule_id}): this rule's text bars conflicting local ordinances.`);
      flag(local.rule.team_rule_id, `Possible conflict with ${rule.title} (${rule.jurisdiction}, ${rule.team_rule_id}), which bars conflicting local ordinances.`);
    }
  }

  return entries.map(({ rule, result }) => {
    if (result.result === 'not_applicable') return result;
    const found = notes.get(rule.team_rule_id) ?? [];
    const parts = [...(rule.conflict_flag && rule.conflict_note ? [rule.conflict_note] : []), ...found];
    const conflict = rule.conflict_flag || found.length > 0;
    return conflict ? { ...result, conflict_flag: true, conflict_note: parts.length ? parts.join(' ') : null } : result;
  });
};

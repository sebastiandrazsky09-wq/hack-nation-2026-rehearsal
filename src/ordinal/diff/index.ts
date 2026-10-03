// Change engine: evaluates each case with the general apply engine over the whole exportable rule set and reports
// the addresses where the selected rules change or apply. No case-specific logic; selection lives in select.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyAddress } from '../apply';
import { DEFAULT_AS_OF, type Address, type ApplyResult, type InternalRule, type JurisdictionStack } from '../contracts';
import { PATHS, loadAddresses, readStacks } from '../corpus';
import type { ChangeCase, ChangeResult, ComputeChanges, DiffReport, RunDiff } from '../entrypoints';
import { buildExport } from '../export/build';
import { assertIsoDate } from '../status';
import { selectRules } from './select';

export { categoryCodes, resolveJurisdiction, selectRules } from './select';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('s') ? word + 'es' : word + 's'}`;

function datesOf(c: ChangeCase, defaultAsOf: string): string[] {
  if (c.type === 'as_of') return [c.as_of_before ?? c.as_of ?? defaultAsOf, c.as_of_after ?? c.as_of ?? defaultAsOf];
  return [c.as_of ?? defaultAsOf];
}

export const computeChanges: ComputeChanges = (cases, rules, addresses, stacks, defaultAsOf) => {
  const errors: string[] = [];
  const ordered = [...addresses].sort((a, b) => cmp(a.address_id, b.address_id));
  const withStack = ordered.filter(a => stacks[a.address_id]);
  if (withStack.length < ordered.length) errors.push(`${ordered.length - withStack.length} addresses have no jurisdiction stack and were skipped`);
  const cache = new Map<string, ApplyResult[]>();
  const evaluate = (date: string, address: Address, stack: JurisdictionStack) => {
    const key = `${date}|${address.address_id}`;
    if (!cache.has(key)) cache.set(key, applyAddress(rules, address, stack, date));
    return cache.get(key)!;
  };

  const results = cases.map((c): ChangeResult => {
    const dates = datesOf(c, defaultAsOf);
    const selections = selectRules(c, rules);
    const selectedIds = new Set(selections.flatMap(s => s.team_rule_ids));
    const unresolved = selections.filter(s => !s.team_rule_ids.length).map(s => s.selector);
    for (const selector of unresolved) errors.push(`${c.test_id}: ${selector} resolved to no rule`);
    const base = { test_id: c.test_id, title: c.title ?? null, type: c.type, dates, selected: selections.map(s => ({ selector: s.selector, team_rule_ids: s.team_rule_ids })) };
    const bad = dates.find(d => { try { assertIsoDate(d); return false; } catch { return true; } });
    if (bad !== undefined) {
      errors.push(`${c.test_id}: invalid date ${bad}`);
      return { ...base, affected_address_ids: [], conflict_flag_address_ids: [], notes: `Case ${c.test_id} was not evaluated: the date ${bad} is not a valid YYYY-MM-DD date.`, counts: {} };
    }

    const scope = c.states?.length ? withStack.filter(a => c.states!.includes(stacks[a.address_id].state)) : withStack;
    const counts: ChangeResult['counts'] = Object.fromEntries(dates.map(d => [d, {} as Record<string, number>]));
    const affected = new Set<string>(); const flagged = new Set<string>();
    for (const address of scope) {
      const stack = stacks[address.address_id];
      const perDate = dates.map(date => {
        const picked = new Map(evaluate(date, address, stack).filter(r => selectedIds.has(r.team_rule_id)).map(r => [r.team_rule_id, r]));
        for (const r of picked.values()) {
          counts[date][r.result] = (counts[date][r.result] ?? 0) + 1;
          if (r.conflict_flag) flagged.add(address.address_id);
        }
        return picked;
      });
      const changes = c.type === 'as_of' && perDate.length === 2
        ? [...perDate[0].keys()].some(id => perDate[0].get(id)?.result !== perDate[1].get(id)?.result)
        : perDate[0].size > 0 && [...perDate[0].values()].some(r => r.result !== 'not_applicable');
      if (changes) affected.add(address.address_id);
    }

    const sentences: string[] = [];
    sentences.push(`Selected ${selections.map(s => `${s.selector} -> ${s.team_rule_ids.length ? s.team_rule_ids.join(', ') : 'no rule'}`).join('; ') || 'nothing'}.`);
    for (const rule of new Map(selections.flatMap(s => s.rules).map(r => [r.team_rule_id, r])).values()) {
      sentences.push(`${rule.team_rule_id} is "${rule.title}" (legal status ${rule.legal_status}${rule.legal_status === 'failed' ? '; the rule failed and is not in force' : ''}).`);
    }
    for (const selector of unresolved) sentences.push(`${selector} resolved to no rule.`);
    sentences.push(`Evaluated ${c.type === 'as_of' ? `on ${dates.join(' and ')}` : `on ${dates[0]}`} over ${plural(scope.length, 'address')}${c.states?.length ? ` in ${c.states.join(', ')}` : ''}.`);
    for (const date of dates) {
      const parts = Object.keys(counts[date]).sort(cmp).map(k => `${k} ${counts[date][k]}`);
      sentences.push(`Results on ${date}: ${parts.join(', ') || 'none'}.`);
    }
    sentences.push(`${plural(affected.size, 'address')} affected, ${flagged.size} flagged for conflict.`);
    if (c.conflict_with?.length) sentences.push(`The case names ${c.conflict_with.join(', ')} as conflicting; flags come from the engine only.`);

    return { ...base, affected_address_ids: [...affected].sort(cmp), conflict_flag_address_ids: [...flagged].sort(cmp), notes: sentences.join(' '), counts };
  });
  return { results, errors };
};

/** `cases` replaces both case files; `casesFile` and `extraCasesFile` replace their paths. */
export type DiffDeps = { cases?: ChangeCase[]; casesFile?: string; extraCasesFile?: string; rules?: InternalRule[]; stacks?: Record<string, JurisdictionStack>; addresses?: Address[] };

const readCases = (file: string): ChangeCase[] => JSON.parse(readFileSync(file, 'utf8')) as ChangeCase[];

export const runDiff = async ({ asOf = DEFAULT_AS_OF, outDir = PATHS.out }: Parameters<RunDiff>[0], deps: DiffDeps = {}): Promise<DiffReport> => {
  const stacks = deps.stacks ?? readStacks();
  const addresses = deps.addresses ?? loadAddresses();
  // Same exportable filter as the export; the engine is stubbed because only the rule set is needed here.
  const rules = deps.rules ?? buildExport(asOf, { stacks, addresses, apply: () => [] }).exported;
  const loadErrors: string[] = [];
  let cases = deps.cases;
  if (!cases) {
    const extra = deps.extraCasesFile ?? PATHS.extraCases;
    const byId = new Map(readCases(deps.casesFile ?? PATHS.changeTests).map(c => [c.test_id, c]));
    if (existsSync(extra)) for (const c of readCases(extra)) {
      if (byId.has(c.test_id)) loadErrors.push(`${c.test_id}: extra case replaces the official case with the same id`);
      byId.set(c.test_id, c);
    }
    cases = [...byId.values()];
  }
  const { results, errors } = computeChanges(cases, rules, addresses, stacks, asOf);
  results.sort((a, b) => cmp(a.test_id, b.test_id));
  const body = Object.fromEntries(results.map(r => [r.test_id, { affected_address_ids: r.affected_address_ids, conflict_flag_address_ids: r.conflict_flag_address_ids, notes: r.notes }]));
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'changes.json');
  writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  return {
    cases: results.length, errors: [...loadErrors, ...errors], file,
    summary: Object.fromEntries(results.map(r => [r.test_id, {
      affected: r.affected_address_ids.length, conflict_flagged: r.conflict_flag_address_ids.length,
      rules: [...new Set(r.selected.flatMap(s => s.team_rule_ids))].sort(cmp)
    }]))
  };
};

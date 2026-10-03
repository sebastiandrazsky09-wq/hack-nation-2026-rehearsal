// Selects the rules a change case talks about, from data only: exact team ids, cited documents, or organizer labels
// of the form <JUR>-<CAT>-<SEQ> resolved against the jurisdictions, category codes and legal statuses of the rule set.
import { CATEGORIES, KNOWN_JURISDICTIONS, levelOf, type Category, type InternalRule } from '../contracts';
import { teamRuleId } from '../compile/ids';
import type { ChangeCase } from '../entrypoints';

export type Selection = { selector: string; team_rule_ids: string[]; rules: InternalRule[] };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');
const cityName = (jurisdiction: string) => jurisdiction.split(',')[0];

/** The code table of compile/ids.ts, read back through teamRuleId (`<ST>-<CODE>-<hash>`) so it is not duplicated. */
export function categoryCodes(): Record<string, Category> {
  const codes: Record<string, Category> = {};
  for (const category of CATEGORIES) codes[teamRuleId('XX', category, 'x').split('-')[1]] = category;
  return codes;
}

/** Exact state code, else the city whose word initials equal the code, else the single city whose letters start with it. */
export function resolveJurisdiction(code: string, rules: InternalRule[]): string | null {
  const upper = code.toUpperCase();
  const all = [...new Set([...KNOWN_JURISDICTIONS as readonly string[], ...rules.map(r => r.jurisdiction)])];
  const states = all.filter(j => levelOf(j) === 'state' && j.toUpperCase() === upper);
  if (states.length) return states.length === 1 ? states[0] : null;
  const cities = all.filter(j => levelOf(j) === 'city');
  const initials = cities.filter(j => cityName(j).split(/[^A-Za-z]+/).filter(Boolean).map(w => w[0].toUpperCase()).join('') === upper);
  if (initials.length) return initials.length === 1 ? initials[0] : null;
  const prefixed = cities.filter(j => letters(cityName(j)).startsWith(letters(upper)) && letters(upper).length > 0);
  return prefixed.length === 1 ? prefixed[0] : null;
}

function selectLabel(label: string, rules: InternalRule[]): InternalRule[] {
  const m = /^([A-Za-z]+)-([A-Za-z]+)-([A-Za-z]*\d+)$/.exec(label.trim());
  if (!m) return [];
  const jurisdiction = resolveJurisdiction(m[1], rules);
  const category = categoryCodes()[m[2].toUpperCase()];
  if (!jurisdiction || !category) return [];
  const proposal = /^P/i.test(m[3]);
  return rules.filter(r => r.jurisdiction === jurisdiction && r.category === category && (proposal ? r.legal_status !== 'enacted' : r.legal_status === 'enacted'));
}

export function selectRules(c: ChangeCase, rules: InternalRule[]): Selection[] {
  const make = (selector: string, picked: InternalRule[]): Selection => ({ selector, team_rule_ids: picked.map(r => r.team_rule_id).sort(cmp), rules: picked });
  return [
    ...(c.team_rule_ids ?? []).map(id => make(id, rules.filter(r => r.team_rule_id === id))),
    ...(c.source_doc_ids ?? []).map(doc => make(doc, rules.filter(r => r.source_doc_id === doc || r.also_supported_by.some(a => a.source_doc_id === doc)))),
    ...(c.rule_ids ?? []).map(label => make(label, selectLabel(label, rules)))
  ];
}

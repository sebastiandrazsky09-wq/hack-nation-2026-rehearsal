// Template text derived from a decision and from the rule dates: change points and the one-line batch reason.
import type { InternalRule } from '../ordinal/contracts';
import { levelOf } from '../ordinal/contracts';
import { passSummary, type CheckResponse } from './contract';

type ChangePoint = CheckResponse['change_points'][number];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const human = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Dates on which a rule of the category reaches (by jurisdiction) this property, or stops: enactment, effect, repeal. Full ISO dates only. */
export function changePoints(rules: InternalRule[], state: string, legalCity: string | null): ChangePoint[] {
  const points = new Map<string, ChangePoint>();
  for (const rule of rules) {
    if (rule.legal_status === 'failed') continue;
    if (levelOf(rule.jurisdiction) === 'state' ? rule.jurisdiction !== state : rule.jurisdiction !== legalCity) continue;
    for (const [date, what] of [[rule.enacted_date, 'is enacted'], [rule.effective_date, 'takes effect'], [rule.repeal_date, 'is repealed']] as const) {
      if (date && FULL_DATE.test(date)) points.set(`${date}|${rule.team_rule_id}|${what}`, { date, label: `${human(date)}: ${rule.title} ${what}` });
    }
  }
  return [...points.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export function mergeChangePoints(lists: ChangePoint[][]): ChangePoint[] {
  const seen = new Map<string, ChangePoint>();
  for (const p of lists.flat()) seen.set(`${p.date}|${p.label}`, p);
  return [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** The first determining rule's title and outcome, else the first review detail, else the PASS sentence. */
export function topReason(d: Pick<CheckResponse, 'determining' | 'review'>, asOf: string): string {
  if (d.determining.length) return `${d.determining[0].title}: ${d.determining[0].outcome}`;
  if (d.review.length) return d.review[0].detail;
  return passSummary(asOf);
}

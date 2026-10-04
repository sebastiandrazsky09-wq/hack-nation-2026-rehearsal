// envelope(): the decision function evaluated over what a request leaves open: the amount, a fact the record lacks, the date.
// Enumerated, not symbolic. Every breakpoint is a number already in the compiled store (a verified constraint bound, a coverage
// threshold, a rule date); every part of the result is the decision the same `evaluate()` behind check() returns there.
import { createHash } from 'node:crypto';
import { DEFAULT_AS_OF, levelOf } from '../ordinal/contracts';
import { DISCLAIMER } from '../server/ordinal';
import {
  ACTIONS, ENVELOPE_LIMITS, SUPPLIABLE_FACTS, canonicalEnvelopeRequest,
  type CallerFacts, type Decision, type EnvelopeInterval, type EnvelopeRequest, type EnvelopeResponse
} from './contract';
import { evaluate, type Evaluation, type GateData } from './index';

type Fact = (typeof SUPPLIABLE_FACTS)[number];
/** What holds at one date with one set of facts: a decision when the amount is fixed (or the action has none), else the amount intervals. */
type Outcome = { decision: Decision | null; intervals: EnvelopeInterval[] | null; evaluations: Evaluation[] };

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const permits = (d: Decision) => d === 'PASS' || d === 'REQUIRE';
const shape = (o: Outcome) => JSON.stringify([o.decision, o.intervals?.map(i => [i.from, i.from_exclusive, i.to, i.decision])]);

export function envelope(request: EnvelopeRequest, data: GateData): EnvelopeResponse {
  const started = performance.now();
  const asOf = request.context?.as_of ?? DEFAULT_AS_OF;
  const spec = ACTIONS[request.action.name];
  const parameter = spec.parameter;
  const supplied = request.context?.facts;
  const requested = parameter ? request.action.properties?.[parameter.name] ?? null : null;
  const open = parameter !== null && requested === null;
  let evaluations = 0;
  // Strict throughout: an unknown property or a supplied fact that contradicts the record is refused exactly as /check refuses it.
  const at = (value: number | null, date: string, facts: CallerFacts | undefined): Evaluation => { evaluations++; return evaluate(data, spec, value, date, request.resource.id, facts, true); };

  const categoryRules = data.rules.filter(r => r.category === spec.category);
  const ruleById = new Map(categoryRules.map(r => [r.team_rule_id, r]));
  const constraints = data.constraints.filter(c => c.action === spec.name && ruleById.has(c.rule_id));

  // Amount axis. A limit is judged by "at or under max" and "over hard_max" alone, so the decision cannot change between two neighbouring bounds.
  const bounds = parameter
    ? [...new Set(constraints.flatMap(c => [c.max, c.hard_max]).filter((n): n is number => n !== null && n > parameter.min && n < parameter.max))].sort((a, b) => a - b)
    : [];
  const sweep = (date: string, facts: CallerFacts | undefined): Outcome => {
    const p = parameter!;
    const ends = [...bounds, p.max];
    const intervals: EnvelopeInterval[] = []; const firsts: Evaluation[] = [];
    ends.forEach((to, i) => {
      const e = at(to, date, facts);
      const last = intervals[intervals.length - 1];
      if (last && last.decision === e.decided.decision) { last.to = to; return; }
      intervals.push({
        from: i === 0 ? p.min : ends[i - 1], from_exclusive: i === 0 ? p.min_exclusive : true, to,
        decision: e.decided.decision, permit: permits(e.decided.decision), bounding_rule_id: null, bounding_citation: null, bound_text: null
      });
      firsts.push(e);
    });
    // The bound that ends an interval belongs to a rule that takes part in the decision on one side of it.
    intervals.forEach((interval, i) => {
      if (i === intervals.length - 1) return;
      const involved = new Set<string | null>([...firsts[i + 1].decided.determining, ...firsts[i + 1].decided.review, ...firsts[i].decided.determining].map(r => r.rule_id));
      const c = constraints.find(k => (k.max === interval.to || k.hard_max === interval.to) && involved.has(k.rule_id));
      if (!c) return;
      interval.bounding_rule_id = c.rule_id;
      interval.bounding_citation = ruleById.get(c.rule_id)?.citation ?? null;
      interval.bound_text = c.max === interval.to ? c.value_text : c.hard_max_text;
    });
    return { decision: null, intervals, evaluations: firsts };
  };
  const outcomeAt = (date: string, facts: CallerFacts | undefined): Outcome => {
    if (open) return sweep(date, facts);
    const e = at(requested, date, facts);
    return { decision: e.decided.decision, intervals: null, evaluations: [e] };
  };

  // The requested point (when there is one) and the amount axis on the requested date.
  const point = open ? null : at(requested, asOf, supplied);
  const amounts = parameter ? sweep(asOf, supplied) : null;
  const present: Evaluation[] = [...(point ? [point] : []), ...(amounts?.evaluations ?? [])];
  const base = present[0];
  const permitted: EnvelopeResponse['permitted'] = parameter && amounts?.intervals
    ? {
        parameter: parameter.name, unit: parameter.unit, intervals: amounts.intervals,
        reason: amounts.intervals.some(i => i.permit) ? null : amounts.intervals.some(i => i.decision === 'REVIEW') ? 'bound_not_computable' : 'prohibited'
      }
    : null;

  // Fact axis: a fact the record lacks, the caller has not supplied, and some unresolved point says would settle it.
  // Candidate values are each coverage threshold of the category's rules and its two neighbours; between candidates no condition changes.
  const thresholds = (fact: Fact): number[] => {
    const values: number[] = [];
    for (const rule of categoryRules) {
      for (const c of [...rule.coverage.requires, ...rule.coverage.exempt_if.flat()]) {
        if (fact === 'units' && c.fact === 'units') values.push(c.value);
        if (fact === 'year_built' && c.fact === 'year_built') values.push(Number(c.date.slice(0, 4)));
        if (fact === 'year_built' && c.fact === 'building_age_years') values.push(Number(asOf.slice(0, 4)) - c.years);
      }
    }
    return values.filter(Number.isFinite);
  };
  const decides: EnvelopeResponse['decides'] = SUPPLIABLE_FACTS
    .filter(fact => base.facts.find(f => f.name === fact)?.source === 'missing' && present.some(e => e.decided.review.some(r => r.resolvable_by.includes(fact))))
    .map(fact => {
      const floor = fact === 'units' ? 1 : 1600;
      const values = [...new Set([...(fact === 'units' ? [1] : []), ...thresholds(fact).flatMap(t => [t - 1, t, t + 1])])].filter(v => v >= floor).sort((a, b) => a - b);
      const regions: { from: number | null; to: number | null; outcome: Outcome }[] = [];
      for (const value of values) {
        const outcome = outcomeAt(asOf, { ...supplied, [fact]: value });
        const last = regions[regions.length - 1];
        if (last && shape(last.outcome) === shape(outcome)) continue;
        if (last) last.to = value - 1;
        regions.push({ from: regions.length === 0 && fact === 'year_built' ? null : value, to: null, outcome });
      }
      return { fact, regions: regions.map(r => ({ from: r.from, to: r.to, decision: r.outcome.decision, intervals: r.outcome.intervals })) };
    });

  // Time axis: every date on which a rule that reaches this property is enacted, takes effect or is repealed, and the year boundaries of a
  // figure the source states for one calendar year. Between two neighbouring dates nothing the decision reads changes.
  const dated = new Map<string, { labels: string[]; rules: string[] }>();
  const mark = (date: string, text: string, ruleId: string) => {
    const entry = dated.get(date) ?? { labels: [], rules: [] };
    if (!entry.labels.includes(text)) entry.labels.push(text);
    if (!entry.rules.includes(ruleId)) entry.rules.push(ruleId);
    dated.set(date, entry);
  };
  for (const rule of categoryRules) {
    if (rule.legal_status === 'failed') continue;
    if (levelOf(rule.jurisdiction) === 'state' ? rule.jurisdiction !== base.stack.state : rule.jurisdiction !== base.stack.legal_city) continue;
    for (const [date, what] of [[rule.enacted_date, 'is enacted'], [rule.effective_date, 'takes effect'], [rule.repeal_date, 'is repealed']] as const) {
      if (date && FULL_DATE.test(date)) mark(date, `${rule.title} ${what}`, rule.team_rule_id);
    }
    for (const c of constraints) {
      if (c.rule_id !== rule.team_rule_id || c.figure_year === null || c.figure_year === undefined) continue;
      mark(`${c.figure_year}-01-01`, `the figure ${rule.citation} states for ${c.figure_year} starts to apply`, rule.team_rule_id);
      mark(`${c.figure_year + 1}-01-01`, `the figure ${rule.citation} states for ${c.figure_year} stops applying`, rule.team_rule_id);
    }
  }
  const starts: (string | null)[] = [null, ...[...dated.keys()].sort()];
  const spans: { from: string | null; to: string | null; outcome: Outcome }[] = [];
  starts.forEach((from, i) => {
    const to = i + 1 < starts.length ? addDays(starts[i + 1]!, -1) : null;
    const outcome = outcomeAt(from ?? to ?? asOf, supplied);
    const last = spans[spans.length - 1];
    if (last && shape(last.outcome) === shape(outcome)) { last.to = to; return; }
    spans.push({ from, to, outcome });
  });
  const timeline: EnvelopeResponse['timeline'] = spans.map(s => ({
    from: s.from, to: s.to, current: (s.from === null || s.from <= asOf) && (s.to === null || asOf <= s.to),
    decision: s.outcome.decision, intervals: s.outcome.intervals,
    cause_rule_ids: s.from ? dated.get(s.from)?.rules ?? [] : [], cause_label: s.from ? dated.get(s.from)?.labels.join('; ') ?? null : null
  }));

  // Duties attach to what is permitted; unresolved points and quoted sentences are those of the requested date.
  const obligations: EnvelopeResponse['obligations'] = []; const review: EnvelopeResponse['review'] = []; const evidence: EnvelopeResponse['evidence'] = [];
  for (const e of present) {
    if (permits(e.decided.decision)) for (const o of e.decided.obligations) if (!obligations.some(x => x.rule_id === o.rule_id && x.text === o.text)) obligations.push(o);
    for (const r of e.decided.review) if (!review.some(x => x.code === r.code && x.rule_id === r.rule_id)) review.push(r);
    for (const q of e.decided.evidence) if (!evidence.some(x => x.rule_id === q.rule_id && x.kind === q.kind && x.quoted_span === q.quoted_span)) evidence.push(q);
  }

  return {
    envelope_id: 'env_' + createHash('sha256').update(JSON.stringify(canonicalEnvelopeRequest(request, asOf)) + data.rulesetVersion).digest('hex').slice(0, 16),
    ruleset_version: data.rulesetVersion, as_of: asOf,
    evaluated_ms: performance.now() - started, evaluations,
    action: spec.name, decision: point?.decided.decision ?? null,
    permitted, decides, timeline, obligations, review, evidence,
    coverage: { jurisdictions: base.jurisdictions, category: spec.category, known_gaps: base.gaps.map(g => g.text) },
    limits: ENVELOPE_LIMITS, disclaimer: DISCLAIMER
  };
}

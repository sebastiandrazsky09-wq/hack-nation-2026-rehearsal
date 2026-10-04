// The decision function. Pure: no I/O, no clock, no model. It reads the engine's per-rule results and the verified constraints; it never re-derives status, coverage or precedence.
import type { ApplyResult, InternalRule } from '../ordinal/contracts';
import { DECISION_PRECEDENCE, SUPPLIABLE_FACTS, passSummary, type ActionSpec, type CheckResponse, type Constraint, type Decision, type ReviewCode } from './contract';

export type DecideRule = {
  rule: Pick<InternalRule, 'team_rule_id' | 'title' | 'jurisdiction' | 'citation' | 'requirement' | 'quoted_span' | 'source_doc_id' | 'source_url' | 'source_origin' | 'retrieved_at' | 'verification_method' | 'effective_date'>;
  /** The engine's answer for this rule at this property, facts already overlaid. */
  result: ApplyResult;
  /** Verified constraints of this rule for this action. */
  constraints: Constraint[];
};
export type DecideInput = {
  action: ActionSpec;
  /** The action's parameter value; null for an action without one. */
  value: number | null;
  asOf: string;
  /** Every rule of the action's category, with its engine result. */
  rules: DecideRule[];
  /** Sentences naming the known gaps for this property's jurisdictions and this action's category. */
  gaps: string[];
};
export type Decided = Pick<CheckResponse, 'decision' | 'permit' | 'summary' | 'determining' | 'obligations' | 'review' | 'upcoming' | 'evidence'>;

/** What one verified constraint says about one request. */
export type Finding =
  | { kind: 'violated' | 'satisfied' | 'obligation'; constraint: Constraint; detail: string }
  | { kind: 'review'; code: ReviewCode; constraint: Constraint | null; detail: string };

const quoted = (text: string | null) => (text ? ` "${text}"` : '');

function judgeLimit(c: Constraint, action: ActionSpec, value: number | null, asOf: string): Finding {
  const unit = action.parameter?.unit ?? '';
  const shown = value === null ? 'no value' : `${value} ${unit}`;
  const review = (why: string): Finding => ({ kind: 'review', code: 'limit_not_computable', constraint: c, detail: `${why} The request is ${shown}.` });
  // A figure the text states for one calendar year says nothing about another year.
  if (c.figure_year !== null && c.figure_year !== undefined && Number(asOf.slice(0, 4)) !== c.figure_year) {
    return review(`The source states the limit${quoted(c.value_text)} for ${c.figure_year}; the figure for ${asOf.slice(0, 4)} is not in the data.`);
  }
  if (value !== null && c.max !== null && value <= c.max) return { kind: 'satisfied', constraint: c, detail: `${shown} is within the limit of ${c.max} ${unit}${quoted(c.value_text)}.` };
  if (value !== null && c.hard_max !== null && value > c.hard_max) {
    return { kind: 'violated', constraint: c, detail: `${shown} exceeds the highest limit the text allows in any case, ${c.hard_max} ${unit}${quoted(c.hard_max_text)}.` };
  }
  // One cap for everyone, not adjustable: over it is a violation.
  if (value !== null && c.max !== null && c.hard_max === null && !c.open_above && value > c.max) {
    return { kind: 'violated', constraint: c, detail: `${shown} exceeds the limit of ${c.max} ${unit}${quoted(c.value_text)}.` };
  }
  if (c.max !== null && c.hard_max !== null) return review(`The limit is ${c.max} ${unit}${quoted(c.value_text)} in general and up to ${c.hard_max} ${unit}${quoted(c.hard_max_text)} in cases the data cannot tell apart.`);
  if (c.max !== null && c.open_above) return review(`The limit of ${c.max} ${unit}${quoted(c.value_text)} may be adjusted upward over time and the adjusted figure is not in the data.`);
  return review(`The limit${quoted(c.value_text ?? c.hard_max_text ?? c.evidence_quote)} cannot be computed from the data.`);
}

/** Each verified constraint of an applying rule judged against the request. No constraint at all is itself a review item. */
export function judgeConstraints(rule: DecideRule['rule'], constraints: Constraint[], action: ActionSpec, value: number | null, asOf: string): Finding[] {
  if (constraints.length === 0) return [{ kind: 'review', code: 'constraint_not_modeled', constraint: null, detail: rule.requirement }];
  const findings: Finding[] = [];
  for (const c of constraints) {
    if (c.effect === 'prohibit') {
      findings.push(c.elements_untestable === null
        ? { kind: 'violated', constraint: c, detail: `${rule.citation} prohibits this action.` }
        : { kind: 'review', code: 'conditional_prohibition', constraint: c, detail: `${rule.citation} prohibits this action only where: ${c.elements_untestable}` });
    } else if (c.effect === 'limit') findings.push(judgeLimit(c, action, value, asOf));
    else if (c.effect === 'obligation') findings.push({ kind: 'obligation', constraint: c, detail: c.obligation_text ?? rule.requirement });
  }
  return findings;
}

/** The decision one rule's findings alone would give. */
export function decisionOf(findings: Finding[]): Decision {
  if (findings.some(f => f.kind === 'violated')) return 'BLOCK';
  if (findings.some(f => f.kind === 'review')) return 'REVIEW';
  if (findings.some(f => f.kind === 'obligation')) return 'REQUIRE';
  return 'PASS';
}

type ReviewItem = Decided['review'][number];
type Row = Decided['determining'][number];

export function decide(input: DecideInput): Decided {
  const { action, value, asOf, rules, gaps } = input;
  const review: ReviewItem[] = [];
  const upcoming: Decided['upcoming'] = [];
  const obligations: Decided['obligations'] = [];
  const findingsByRule = new Map<string, Finding[]>();
  const byId = new Map(rules.map(r => [r.rule.team_rule_id, r.rule]));
  const conflicts = new Map<string, string | null>();

  for (const { rule, result, constraints } of rules) {
    const id = rule.team_rule_id;
    switch (result.result) {
      case 'not_applicable': case 'superseded': break;
      case 'pending': case 'not_yet_effective': {
        // An enacted rule's text is fixed, so what it would decide can be stated. A pending proposal's text can still change: no forecast.
        const own = result.result === 'not_yet_effective' && constraints.length ? judgeConstraints(rule, constraints, action, value, rule.effective_date && /^\d{4}-\d{2}-\d{2}$/.test(rule.effective_date) ? rule.effective_date : asOf) : null;
        upcoming.push({ rule_id: id, title: rule.title, status: result.result, effective_date: rule.effective_date, would_be: own ? decisionOf(own) : null });
        break;
      }
      case 'unknown': {
        const code: ReviewCode = result.reason_code === 'missing_fact' ? 'missing_fact' : result.reason_code === 'cutoff_ambiguous' ? 'cutoff_ambiguous' : 'unverifiable_condition';
        review.push({ code, rule_id: id, detail: result.explanation, missing_facts: result.missing_facts, resolvable_by: SUPPLIABLE_FACTS.filter(f => result.missing_facts.includes(f)) });
        break;
      }
      case 'applies': {
        const findings = judgeConstraints(rule, constraints, action, value, asOf);
        findingsByRule.set(id, findings);
        for (const f of findings) {
          if (f.kind === 'review') review.push({ code: f.code, rule_id: id, detail: f.detail, missing_facts: [], resolvable_by: [] });
          if (f.kind === 'obligation') obligations.push({ rule_id: id, citation: rule.citation, text: f.detail, evidence_quote: f.constraint.evidence_quote });
        }
        if (result.conflict_flag) conflicts.set(id, result.conflict_note);
        break;
      }
    }
  }
  // A conflict on a rule that blocks stays BLOCK and travels as a note; on any other applying rule it needs a human.
  for (const [id, note] of conflicts) {
    if (!findingsByRule.get(id)?.some(f => f.kind === 'violated')) {
      review.push({ code: 'conflict', rule_id: id, detail: note ?? 'Another rule may conflict with this one; the sources do not settle it.', missing_facts: [], resolvable_by: [] });
    }
  }
  for (const gap of gaps) review.push({ code: 'coverage_gap', rule_id: null, detail: gap, missing_facts: [], resolvable_by: [] });

  const blocked = [...findingsByRule.values()].some(fs => fs.some(f => f.kind === 'violated'));
  const produced = new Set<Decision>([...(blocked ? ['BLOCK' as const] : []), ...(review.length ? ['REVIEW' as const] : []), ...(obligations.length ? ['REQUIRE' as const] : [])]);
  const decision = DECISION_PRECEDENCE.find(d => produced.has(d)) ?? 'PASS';

  const rows: Row[] = []; const evidence: Decided['evidence'] = [];
  const ruleEvidence = (id: string) => {
    const r = byId.get(id)!;
    if (evidence.some(e => e.rule_id === id && e.kind === 'rule')) return;
    evidence.push({ rule_id: id, citation: r.citation, quoted_span: r.quoted_span, source_doc_id: r.source_doc_id, source_url: r.source_url, source_origin: r.source_origin, retrieved_at: r.retrieved_at, verification_method: r.verification_method, kind: 'rule' });
  };
  const constraintEvidence = (id: string, c: Constraint) => {
    const r = byId.get(id)!;
    evidence.push({ rule_id: id, citation: r.citation, quoted_span: c.evidence_quote, source_doc_id: r.source_doc_id, source_url: r.source_url, source_origin: r.source_origin, retrieved_at: r.retrieved_at, verification_method: c.verification_method, kind: 'constraint' });
  };
  const row = (id: string, effect: Row['effect'], outcome: Row['outcome'], detail: string, note: string | null = null) => {
    const r = byId.get(id)!;
    rows.push({ rule_id: id, title: r.title, jurisdiction: r.jurisdiction, citation: r.citation, effect, outcome, detail, conflict_note: note });
  };

  if (decision === 'REVIEW') {
    const seen = new Set<string>();
    for (const item of review) {
      if (item.rule_id === null || seen.has(item.rule_id)) continue;
      seen.add(item.rule_id);
      const c = (findingsByRule.get(item.rule_id) ?? []).find((f): f is Extract<Finding, { kind: 'review' }> => f.kind === 'review' && f.code === item.code)?.constraint ?? null;
      row(item.rule_id, c?.effect ?? null, 'unresolved', item.detail);
      ruleEvidence(item.rule_id);
      if (c) constraintEvidence(item.rule_id, c);
    }
  } else {
    const kind = decision === 'BLOCK' ? 'violated' : decision === 'REQUIRE' ? 'obligation' : 'satisfied';
    for (const [id, findings] of findingsByRule) {
      for (const f of findings) {
        if (f.kind !== kind) continue;
        row(id, f.constraint.effect, kind, f.detail, kind === 'violated' ? conflicts.get(id) ?? (conflicts.has(id) ? 'Possible conflict with another rule; the sources do not settle it.' : null) : null);
        ruleEvidence(id);
        constraintEvidence(id, f.constraint);
      }
    }
  }

  return { decision, permit: decision === 'PASS' || decision === 'REQUIRE', summary: summarize(decision, asOf, rows, review, obligations, upcoming, gaps), determining: rows, obligations, review, upcoming, evidence };
}

function summarize(decision: Decision, asOf: string, rows: Row[], review: ReviewItem[], obligations: Decided['obligations'], upcoming: Decided['upcoming'], gaps: string[]): string {
  // With nothing in force the PASS sentence is the fixed one. With a limit in force that the request stays within, saying "no constraint in force" would be false.
  const head = decision === 'PASS' ? (rows.length ? `No modeled constraint is violated: the request is within the ${rows.length === 1 ? 'modeled limit' : `${rows.length} modeled limits`} in force for this action at this property on ${asOf}.` : passSummary(asOf))
    : decision === 'BLOCK' ? `Blocked: ${rows.length === 1 ? 'a rule' : `${rows.length} rules`} in force at this property on ${asOf} prohibit or cap this action as requested.`
    : decision === 'REVIEW' ? `Needs review: ${review.length === 1 ? 'one point' : `${review.length} points`} cannot be settled from the data and the verified constraints on ${asOf}.`
    : `No modeled prohibition in force on ${asOf}; ${obligations.length === 1 ? 'one modeled duty attaches' : `${obligations.length} modeled duties attach`} to this action.`;
  const soon = upcoming.length
    ? ` Not yet in force: ${upcoming.map(u => `${u.title} (${u.status === 'pending' ? 'pending, not enacted' : `effective ${u.effective_date ?? 'on a later date'}`})`).join('; ')}.`
    : '';
  const coverage = gaps.length ? ` Known coverage gaps: ${gaps.join(' ')}` : ' No known coverage gap for this category in these jurisdictions.';
  return head + soon + coverage;
}

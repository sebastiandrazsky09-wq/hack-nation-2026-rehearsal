// Per-rule trace: the engine's own checks shown step by step. Built from deriveStatus, evaluateCoverage and the result applyAddress returned; nothing is re-decided here.
import { evaluateCoverage } from '../ordinal/apply/coverage';
import type { Address, ApplyResult, InternalRule, JurisdictionStack } from '../ordinal/contracts';
import { deriveStatus } from '../ordinal/status';
import type { ActionSpec, CheckResponse, Constraint } from './contract';
import { judgeConstraints } from './decide';

type Trace = CheckResponse['trace'][number];
type Step = Trace['steps'][number];

export type TraceInput = { rule: InternalRule; result: ApplyResult; constraints: Constraint[] };

export function buildTrace(inputs: TraceInput[], address: Address, stack: JurisdictionStack, asOf: string, action: ActionSpec, value: number | null): Trace[] {
  return inputs.map(({ rule, result, constraints }) => ({ rule_id: rule.team_rule_id, title: rule.title, result: result.result, steps: stepsFor(rule, result, constraints, address, stack, asOf, action, value) }));
}

function stepsFor(rule: InternalRule, result: ApplyResult, constraints: Constraint[], address: Address, stack: JurisdictionStack, asOf: string, action: ActionSpec, value: number | null): Step[] {
  const steps: Step[] = [];
  const place = stack.legal_city ?? stack.state;
  if (result.reason_code === 'outside_jurisdiction') return [{ check: 'jurisdiction', outcome: 'not_matched', detail: `The rule covers ${rule.jurisdiction}; the property is in ${place}.` }];
  if (result.reason_code === 'jurisdiction_unresolved') {
    steps.push({ check: 'jurisdiction', outcome: 'unknown', detail: `The rule covers ${rule.jurisdiction}; the property's city could not be resolved within ${stack.state}.` });
  } else steps.push({ check: 'jurisdiction', outcome: 'matched', detail: `The rule covers ${rule.jurisdiction}, which includes ${place}.` });

  const status = deriveStatus(rule, asOf);
  steps.push({ check: 'status', outcome: status === 'in_force' ? 'matched' : 'not_matched', detail: `On ${asOf} the rule is ${status.replace(/_/g, ' ')}.` });
  if (status === 'failed' || result.reason_code === 'jurisdiction_unresolved') return steps;

  const coverage = evaluateCoverage(rule.coverage, address, asOf);
  const texts = coverage.deciding.map(d => d.text).filter(Boolean).join('; ');
  steps.push({
    check: 'coverage', outcome: coverage.falseBecause === 'requirement_not_met' ? 'not_matched' : coverage.value === null ? 'unknown' : 'matched',
    detail: coverage.falseBecause === 'requirement_not_met' ? `A coverage requirement is not met: ${texts}` : coverage.value === null ? `Cannot be settled from the data: ${texts}` : 'The coverage requirements are met.'
  });
  if (rule.coverage.exempt_if.length) {
    steps.push({
      check: 'exemption', outcome: coverage.falseBecause === 'exempt' ? 'matched' : coverage.value === null && coverage.falseBecause === null ? 'unknown' : 'not_matched',
      detail: coverage.falseBecause === 'exempt' ? `An exemption holds: ${texts}` : `No stated exemption is established${coverage.value === null ? ' (some cannot be tested from the data)' : ''}.`
    });
  }
  if (result.result === 'superseded' || result.reason_code === 'local_coverage_unknown' || result.conflict_flag) {
    steps.push({ check: 'precedence', outcome: result.result === 'superseded' ? 'matched' : 'unknown', detail: result.result === 'superseded' || result.reason_code === 'local_coverage_unknown' ? result.explanation : (result.conflict_note ?? 'Possible conflict with another rule.') });
  }
  if (result.result === 'applies') {
    // matched = a constraint bears on this request (violated or a duty); not_matched = checked and satisfied or without effect; unknown = needs review.
    const findings = judgeConstraints(rule, constraints, action, value);
    if (findings.length === 0) steps.push({ check: 'constraint', outcome: 'not_matched', detail: 'The verified constraints have no effect on this action.' });
    for (const f of findings) steps.push({ check: 'constraint', outcome: f.kind === 'review' ? 'unknown' : f.kind === 'satisfied' ? 'not_matched' : 'matched', detail: f.detail });
  }
  return steps;
}

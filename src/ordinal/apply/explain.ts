// Deterministic explanation templates, one per reason_code. No model output.
import type { InternalRule, JurisdictionStack } from '../contracts';
import type { Evaluated } from './conditions';

export const REASON_CODES = [
  'covered', 'outside_jurisdiction', 'status_failed', 'status_pending', 'status_not_yet_effective', 'exempt',
  'requirement_not_met', 'missing_fact', 'cutoff_ambiguous', 'unverifiable_condition', 'superseded_by_local', 'local_coverage_unknown'
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type ExplainInput = {
  code: ReasonCode;
  rule: Pick<InternalRule, 'title' | 'jurisdiction' | 'effective_date' | 'repeal_date' | 'legal_status' | 'precedence'>;
  stack: Pick<JurisdictionStack, 'state' | 'legal_city'>;
  asOf: string;
  deciding: Evaluated[];
  missing: string[];
  caveats: string[];
  /** Local rule behind superseded_by_local / local_coverage_unknown. */
  local?: Pick<InternalRule, 'title' | 'jurisdiction'>;
};

const quoteAll = (items: Evaluated[]) => items.map(i => `"${i.text}"`).join('; ');
const list = (items: string[]) => items.join(', ');

function core(i: ExplainInput): string {
  const { rule, asOf } = i; const who = `${rule.title} (${rule.jurisdiction})`;
  switch (i.code) {
    case 'covered': return `${who} applies to this address as of ${asOf}; every coverage condition is met and no exemption holds.`;
    case 'outside_jurisdiction': return `${who} does not cover this address as of ${asOf}: the address is in ${i.stack.legal_city ?? i.stack.state}, outside ${rule.jurisdiction}.`;
    case 'status_failed': return `${who} is not law as of ${asOf}: ${rule.legal_status === 'failed' ? 'it failed to pass' : `it was repealed ${rule.repeal_date}`}.`;
    case 'status_pending': return `${who} is only pending as of ${asOf} and is not in force; it would cover this address in ${rule.jurisdiction} if enacted.`;
    case 'status_not_yet_effective': return `${who} is enacted but takes effect ${rule.effective_date}, after ${asOf}; it is not yet in force at this address.`;
    case 'exempt': return `${who} does not apply as of ${asOf}: an exemption holds (${quoteAll(i.deciding)}).`;
    case 'requirement_not_met': return `${who} does not apply as of ${asOf}: a coverage requirement is not met (${quoteAll(i.deciding)}).`;
    case 'missing_fact': return `Cannot tell whether ${who} applies as of ${asOf}: the dataset has no ${list(i.missing)} for this address (${quoteAll(i.deciding)}).`;
    case 'cutoff_ambiguous': return `Cannot tell whether ${who} applies as of ${asOf}: the building year alone does not settle the date test (${quoteAll(i.deciding)}).`;
    case 'unverifiable_condition': return `Cannot tell whether ${who} applies as of ${asOf}: it depends on facts the dataset does not hold (${list(i.missing)}): ${quoteAll(i.deciding)}.`;
    case 'superseded_by_local': return `${who} yields to a local rule where one governs; ${i.local?.title} (${i.local?.jurisdiction}) applies at this address as of ${asOf}, so the state rule is superseded.${i.rule.precedence.text ? ` Source wording: "${i.rule.precedence.text}"` : ''}`;
    case 'local_coverage_unknown': return `${who} yields to a stricter local rule; whether ${i.local?.title} (${i.local?.jurisdiction}) covers this address as of ${asOf} is unknown, so it cannot be said which rule governs.`;
  }
}

/** Core sentence, plus (for statuses that hide an open coverage question) the open facts, plus caveats. */
export function explain(i: ExplainInput, withOpenQuestion = false): string {
  let text = core(i);
  if (withOpenQuestion && i.deciding.length) text += ` Coverage is also undetermined: ${quoteAll(i.deciding)}${i.missing.length ? ` (missing: ${list(i.missing)})` : ''}.`;
  if (i.caveats.length) text += ` Caveats: ${i.caveats.join('; ')}.`;
  return text;
}

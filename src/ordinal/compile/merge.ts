// Deterministic merge of one group of candidates into one rule. Disagreements are flagged, never resolved by guessing.
import type { InternalRule } from '../contracts';
import { dateFloor } from '../status';

/** One extracted rule of one document, before consolidation. `id` is "<doc_id>#<n>". */
export type Candidate = { id: string; rule: InternalRule };

const byId = (a: Candidate, b: Candidate) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The model's pick, except that a verified member always beats an unverified one and, among verified members, a document
 * from the supplied corpus beats supplemental and ingested ones (so the exported quote comes from the corpus whenever one
 * exists). Ties go to the model's pick when it is still in the running, otherwise to the lowest candidate id.
 */
export function choosePrimary(members: Candidate[], modelPrimaryId: string): Candidate {
  let pool = [...members].sort(byId);
  const verified = pool.filter(m => m.rule.verified);
  if (verified.length) {
    const official = verified.filter(m => m.rule.source_origin === 'official_captured');
    pool = official.length ? official : verified;
  }
  return pool.find(m => m.id === modelPrimaryId) ?? pool[0];
}

type DateField = 'enacted_date' | 'effective_date' | 'repeal_date';
const compatible = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
/** Distinct values, with a less specific date dropped when a more specific one starts with it ("2025-10" and "2025-10-06" are one statement). */
function distinctDates(values: (string | null)[]): string[] {
  const all = [...new Set(values.filter((v): v is string => v !== null))];
  return all.filter(v => !all.some(o => o !== v && o.startsWith(v))).sort();
}
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(dateFloor(a) + 'T00:00:00Z') - Date.parse(dateFloor(b) + 'T00:00:00Z')) / 86_400_000;

/**
 * A bill becomes law and a draft cannot know it: when verified documents of one law say both "pending" and "enacted"
 * (with a date), the law is enacted and the dates come from the enacting document. Likewise "pending" and "failed" is failed.
 * Enacted against failed is a real contradiction and stays with the primary, flagged.
 */
function resolveStatus(primary: Candidate, verified: Candidate[]): { status: InternalRule['legal_status']; from: Candidate | null; conflict: boolean } {
  const kinds = new Set(verified.map(m => m.rule.legal_status));
  const own = primary.rule.legal_status;
  if (kinds.size < 2) return { status: own, from: null, conflict: false };
  if (kinds.has('enacted') && kinds.has('failed')) return { status: own, from: null, conflict: true };
  const winner = kinds.has('failed') ? 'failed' : 'enacted';
  const evidence = verified.filter(m => m.rule.legal_status === winner && (winner === 'failed' || m.rule.enacted_date !== null || m.rule.effective_date !== null)).sort(byId)[0];
  if (!evidence) return { status: own, from: null, conflict: true };
  return { status: winner, from: own === winner ? null : evidence, conflict: false };
}

export function mergeGroup(members: Candidate[], modelPrimaryId: string): InternalRule {
  const primary = choosePrimary(members, modelPrimaryId);
  const others = members.filter(m => m !== primary).sort(byId);
  const verified = [...members].filter(m => m.rule.verified).sort(byId);
  const notes: string[] = []; const basis: string[] = [];
  const note = (s: string | null) => { if (s && !notes.includes(s)) notes.push(s); };
  [...members].sort(byId).forEach(m => note(m.rule.conflict_note));
  let flagged = members.some(m => m.rule.conflict_flag);

  // Status first: it decides whose dates count.
  const status = resolveStatus(primary, verified);
  if (status.conflict) {
    flagged = true;
    const by = new Map<string, string[]>();
    for (const m of verified) by.set(m.rule.legal_status, [...new Set([...(by.get(m.rule.legal_status) ?? []), m.rule.source_doc_id])].sort());
    note(`legal_status differs: ${[...by].sort(([a], [b]) => a < b ? -1 : 1).map(([v, docs]) => `"${v}" (${docs.join(', ')})`).join(' vs ')}`);
  }
  if (status.from) basis.push(`legal_status ${status.status} from ${status.from.rule.source_doc_id}`);
  // Documents that share the resolved status speak about the same stage of the law; only they can lend or contest dates.
  const peers = verified.filter(m => m.rule.legal_status === status.status);
  const dateSource = status.from ?? primary;

  let enacted_date = dateSource.rule.enacted_date;
  const enactedStated = distinctDates(peers.map(m => m.rule.enacted_date));
  if (enacted_date !== null) { const sharper = enactedStated.find(v => v !== enacted_date && v.startsWith(enacted_date!)); if (sharper) enacted_date = sharper; }

  // An effective date is borrowed only from a document that demonstrably describes the same enactment:
  // the rule states an enactment date and the lender states none or a compatible one.
  let effective_date = dateSource.rule.effective_date;
  if (effective_date === null && enacted_date !== null) {
    const lenders = peers.filter(m => m.rule.effective_date !== null && (m.rule.enacted_date === null || compatible(m.rule.enacted_date, enacted_date!)));
    const offered = distinctDates(lenders.map(m => m.rule.effective_date));
    if (offered.length === 1) { effective_date = offered[0]; basis.push(`effective_date ${effective_date} from ${[...new Set(lenders.map(m => m.rule.source_doc_id))].sort().join(', ')}`); }
  }
  if (status.from) {
    if (status.from.rule.enacted_date !== primary.rule.enacted_date && enacted_date) basis.push(`enacted_date ${enacted_date} from ${status.from.rule.source_doc_id}`);
    if (status.from.rule.effective_date !== primary.rule.effective_date && effective_date && !basis.some(b => b.startsWith('effective_date'))) basis.push(`effective_date ${effective_date} from ${status.from.rule.source_doc_id}`);
  }

  // Two documents giving different effective dates less than a year apart are describing the same event differently: flag it.
  // Dates further apart are different amendments of the law, not a conflict.
  const effectiveStated = distinctDates(peers.map(m => m.rule.effective_date));
  const close = effectiveStated.filter(a => effectiveStated.some(b => a !== b && daysBetween(a, b) < 366));
  if (close.length >= 2) {
    flagged = true;
    note(`effective_date differs: ${close.map(v => `"${v}" (${[...new Set(peers.filter(m => m.rule.effective_date === v).map(m => m.rule.source_doc_id))].sort().join(', ')})`).join(' vs ')}`);
  }

  // Headline values of the same law stated by other documents are kept beside the primary's (a formula and this year's figure), never replaced.
  const values: string[] = [];
  for (const m of [primary, ...others]) {
    const v = m.rule.verified ? m.rule.key_value?.trim() : null;
    if (v && !values.some(x => x.toLowerCase() === v.toLowerCase()) && values.length < 3) values.push(v);
  }

  // A primary that states no coverage at all takes the coverage another verified document of the same law states.
  const empty = (m: Candidate) => m.rule.coverage.requires.length === 0 && m.rule.coverage.exempt_if.length === 0;
  const coverageSource = empty(primary) ? verified.filter(m => m !== primary && !empty(m))[0] ?? primary : primary;
  if (coverageSource !== primary) basis.push(`coverage from ${coverageSource.rule.source_doc_id}`);

  return {
    ...primary.rule,
    legal_status: status.status, enacted_date, effective_date,
    coverage: coverageSource.rule.coverage,
    key_value: values.length ? values.join('; ') : primary.rule.key_value,
    status_basis: basis.length ? [primary.rule.status_basis, `[${basis.join('; ')}]`].filter(Boolean).join(' ') : primary.rule.status_basis,
    also_supported_by: others.map(m => ({ source_doc_id: m.rule.source_doc_id, source_url: m.rule.source_url, quoted_span: m.rule.quoted_span, verified: m.rule.verified })),
    conflict_flag: flagged,
    conflict_note: notes.length ? notes.join('; ') : null
  };
}

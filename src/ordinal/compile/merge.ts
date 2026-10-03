// Deterministic merge of one group of candidates into one rule. Disagreements are flagged, never resolved.
import type { InternalRule } from '../contracts';

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
/**
 * Distinct values verified members state for a date, with a less specific date dropped when a more specific one
 * starts with it ("2025-10" and "2025-10-06" are one statement, not two).
 */
function statedDates(members: Candidate[], field: DateField): string[] {
  const all = [...new Set(members.filter(m => m.rule.verified && m.rule[field] !== null).map(m => m.rule[field] as string))];
  return all.filter(v => !all.some(o => o !== v && o.startsWith(v))).sort();
}
/** The primary's date when it states one compatibly, else the single date its verified co-members agree on, else what the primary has. */
function resolveDate(primary: Candidate, members: Candidate[], field: DateField): string | null {
  const stated = statedDates(members, field); const own = primary.rule[field];
  if (stated.length !== 1) return own;
  return own === null || stated[0].startsWith(own) ? stated[0] : own;
}

/** Values stated by verified members, as `"value" (doc ids)` lists, when they disagree. */
function disagreement(members: Candidate[], field: 'effective_date' | 'legal_status'): string | null {
  const docsByValue = new Map<string, Set<string>>();
  const specific = field === 'effective_date' ? new Set(statedDates(members, field)) : null;
  for (const m of members) {
    const value = m.rule[field];
    if (!m.rule.verified || value === null) continue;
    if (specific && !specific.has(value)) continue;
    docsByValue.set(value, (docsByValue.get(value) ?? new Set()).add(m.rule.source_doc_id));
  }
  if (docsByValue.size < 2) return null;
  const parts = [...docsByValue].sort(([a], [b]) => a < b ? -1 : 1).map(([value, docs]) => `"${value}" (${[...docs].sort().join(', ')})`);
  return `${field} differs: ${parts.join(' vs ')}`;
}

export function mergeGroup(members: Candidate[], modelPrimaryId: string): InternalRule {
  const primary = choosePrimary(members, modelPrimaryId);
  const others = members.filter(m => m !== primary).sort(byId);
  const notes: string[] = [];
  const note = (s: string | null) => { if (s && !notes.includes(s)) notes.push(s); };
  [...members].sort(byId).forEach(m => note(m.rule.conflict_note));
  const mechanical = [disagreement(members, 'effective_date'), disagreement(members, 'legal_status')];
  mechanical.forEach(note);
  // A date the primary's document does not state comes from the other documents of the same law when they agree.
  const dates = { enacted_date: resolveDate(primary, members, 'enacted_date'), effective_date: resolveDate(primary, members, 'effective_date'), repeal_date: resolveDate(primary, members, 'repeal_date') };
  const borrowed = (Object.keys(dates) as DateField[]).filter(f => dates[f] !== primary.rule[f])
    .map(f => `${f} ${dates[f]} from ${[...new Set(members.filter(m => m.rule.verified && m.rule[f] !== null && dates[f]!.startsWith(m.rule[f] as string) && (m.rule[f] as string).length === dates[f]!.length).map(m => m.rule.source_doc_id))].sort().join(', ')}`);
  return {
    ...primary.rule, ...dates,
    status_basis: borrowed.length ? [primary.rule.status_basis, `[${borrowed.join('; ')}]`].filter(Boolean).join(' ') : primary.rule.status_basis,
    also_supported_by: others.map(m => ({ source_doc_id: m.rule.source_doc_id, source_url: m.rule.source_url, quoted_span: m.rule.quoted_span, verified: m.rule.verified })),
    conflict_flag: members.some(m => m.rule.conflict_flag) || mechanical.some(Boolean),
    conflict_note: notes.length ? notes.join('; ') : null
  };
}

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

/** Values stated by verified members, as `"value" (doc ids)` lists, when they disagree. */
function disagreement(members: Candidate[], field: 'effective_date' | 'legal_status'): string | null {
  const docsByValue = new Map<string, Set<string>>();
  for (const m of members) {
    const value = m.rule[field];
    if (!m.rule.verified || value === null) continue;
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
  return {
    ...primary.rule,
    also_supported_by: others.map(m => ({ source_doc_id: m.rule.source_doc_id, source_url: m.rule.source_url, quoted_span: m.rule.quoted_span, verified: m.rule.verified })),
    conflict_flag: members.some(m => m.rule.conflict_flag) || mechanical.some(Boolean),
    conflict_note: notes.length ? notes.join('; ') : null
  };
}

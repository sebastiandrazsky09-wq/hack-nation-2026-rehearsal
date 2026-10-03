// Rules with the same team_rule_id collapse into one record. Disagreements are flagged, never resolved.
import type { InternalRule } from '../contracts';

const ORIGIN_RANK: Record<InternalRule['source_origin'], number> = { official_captured: 0, supplemental: 1, ingested: 2 };
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

function compareForPrimary(a: InternalRule, b: InternalRule): number {
  return Number(b.verified) - Number(a.verified)
    || ORIGIN_RANK[a.source_origin] - ORIGIN_RANK[b.source_origin]
    || a.source_doc_id.localeCompare(b.source_doc_id)
    || (a.span_start ?? Infinity) - (b.span_start ?? Infinity)
    || a.quoted_span.localeCompare(b.quoted_span);
}

function mergeGroup(group: InternalRule[]): InternalRule {
  const [primary, ...rest] = [...group].sort(compareForPrimary);
  const support = new Map<string, InternalRule['also_supported_by'][number]>();
  const add = (s: InternalRule['also_supported_by'][number]) => { if (s.source_doc_id !== primary.source_doc_id && !support.has(s.source_doc_id)) support.set(s.source_doc_id, s); };
  for (const m of [primary, ...rest]) {
    if (m !== primary) add({ source_doc_id: m.source_doc_id, source_url: m.source_url, quoted_span: m.quoted_span, verified: m.verified });
    m.also_supported_by.forEach(add);
  }
  const notes: string[] = [];
  const note = (s: string | null) => { if (s && !notes.includes(s)) notes.push(s); };
  group.forEach(m => note(m.conflict_note));
  let flagged = group.some(m => m.conflict_flag);
  for (const field of ['effective_date', 'key_value'] as const) {
    for (const m of rest) {
      const a = primary[field]; const b = m[field];
      if (a !== null && b !== null && !same(a, b)) {
        flagged = true;
        note(`${field} differs: "${a}" (${primary.source_doc_id}) vs "${b}" (${m.source_doc_id})`);
      }
    }
  }
  return { ...primary, also_supported_by: [...support.values()], conflict_flag: flagged, conflict_note: notes.length ? notes.join('; ') : null };
}

export function mergeRules(rules: InternalRule[]): InternalRule[] {
  const groups = new Map<string, InternalRule[]>();
  for (const r of rules) groups.set(r.team_rule_id, [...(groups.get(r.team_rule_id) ?? []), r]);
  return [...groups.values()].map(mergeGroup);
}

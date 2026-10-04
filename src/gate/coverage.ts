// What the corpus does not cover, derived from data only: the official change tests and the source manifest.
import { CATEGORIES, type Category, type InternalRule } from '../ordinal/contracts';
import type { ManifestRow } from '../ordinal/corpus';
import type { ChangeCase } from '../ordinal/entrypoints';
import { categoryCodes, resolveJurisdiction, selectRules } from '../ordinal/diff/select';

export type KnownGap = { jurisdiction: string; category: Category; text: string };

const label = (category: string) => category.replace(/_/g, ' ');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A manifest row is readable when the pack supplied its text or the team captured it. */
export function isReadable(row: ManifestRow, supplementalIds: ReadonlySet<string>): boolean {
  return (row.status === 'ok' && row.text_file !== '') || supplementalIds.has(row.doc_id);
}

export function computeKnownGaps(rules: InternalRule[], cases: ChangeCase[], manifest: ManifestRow[], supplementalIds: ReadonlySet<string>): KnownGap[] {
  const gaps = new Map<string, KnownGap>();
  const add = (jurisdiction: string, category: Category, text: string) => { const key = `${jurisdiction}|${category}`; if (!gaps.has(key)) gaps.set(key, { jurisdiction, category, text }); };

  // 1. A change test names a rule by label and the store has none: the corpus lacks that jurisdiction's rule for that category.
  const codes = categoryCodes();
  for (const c of cases) {
    for (const selection of selectRules(c, rules)) {
      if (selection.rules.length > 0) continue;
      const m = /^([A-Za-z]+)-([A-Za-z]+)-([A-Za-z]*\d+)$/.exec(selection.selector.trim());
      if (!m) continue;
      const jurisdiction = resolveJurisdiction(m[1], rules); const category = codes[m[2].toUpperCase()];
      if (jurisdiction && category) add(jurisdiction, category, `${jurisdiction}: no ${label(category)} rule could be extracted, although change test ${c.test_id} names ${selection.selector}.`);
    }
  }

  // 2. Every listed source for a jurisdiction is unreadable: its categories without a stored rule are unknown, not empty.
  const byJurisdiction = new Map<string, ManifestRow[]>();
  for (const row of manifest) byJurisdiction.set(row.jurisdictions, [...(byJurisdiction.get(row.jurisdictions) ?? []), row]);
  for (const [jurisdiction, rows] of byJurisdiction) {
    if (!jurisdiction || rows.some(r => isReadable(r, supplementalIds))) continue;
    for (const category of CATEGORIES) {
      if (rules.some(r => r.jurisdiction === jurisdiction && r.category === category)) continue;
      add(jurisdiction, category, `${jurisdiction}: none of its ${rows.length} listed sources could be read, and no ${label(category)} rule is stored for it.`);
    }
  }
  return [...gaps.values()].sort((a, b) => cmp(a.jurisdiction, b.jurisdiction) || cmp(a.category, b.category));
}

export const gapsFor = (gaps: KnownGap[], jurisdictions: string[], category: Category): KnownGap[] =>
  gaps.filter(g => g.category === category && jurisdictions.includes(g.jurisdiction));

/** Manifest rows for a property's state and legal city. */
export function sourceCounts(manifest: ManifestRow[], jurisdictions: string[], supplementalIds: ReadonlySet<string>): { sources_read: number; sources_unreadable: number } {
  const rows = manifest.filter(r => jurisdictions.includes(r.jurisdictions));
  const read = rows.filter(r => isReadable(r, supplementalIds)).length;
  return { sources_read: read, sources_unreadable: rows.length - read };
}

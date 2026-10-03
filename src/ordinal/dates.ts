// Lead-owned. Mechanical check of how a document words a date, shared by compile (to reject) and selfcheck (to catch a regression).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ways a full date is commonly written in the corpus: "January 1, 2026", "Jan. 1, 2026", "1 January 2026", "1/1/2026", "1/1/26", "1-1-2026", ISO. */
export function dateVariants(iso: string): RegExp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null;
  const [y, mo, d] = [m[1], Number(m[2]), Number(m[3])];
  const name = MONTHS[mo - 1]; const abbr = name.slice(0, 3);
  const month = `(?:${name}|${abbr}\\.?)`;
  const parts = [
    `${month}\\s+0?${d}(?:st|nd|rd|th)?,?\\s+${y}`,
    `0?${d}(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${month},?\\s+${y}`,
    `(?<![\\d/-])0?${mo}[/-]0?${d}[/-](?:${y}|${y.slice(2)})(?![\\d/-])`,
    escape(iso)
  ];
  return new RegExp(parts.join('|'), 'gi');
}

export type DateContext = 'stated' | 'version_note' | 'amendment_note' | 'period_start' | 'not_found' | 'partial';
const RANGE_AFTER = /^\s*(?:through|thru|to|until|[-–—])\s*(?:the\s+)?(?:[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i;
// History notes of a code: "Amended by ... Effective <date>", "Repealed ... and added by ...", "as amended by ...", and editorial
// version notes such as "[Text of section effective until <date>. For text effective <date>, see below.]".
const AMENDED_BEFORE = /\bamended\s+by\b|\brepealed\b[^\n]{0,60}\badded\s+by\b|\bas\s+amended\b|\btext\b[^\n.]{0,60}\beffective\b/i;
// A code publisher's note on the CURRENT text of a section: "[ Text of section as amended by 2025, 9, Sec. 43 effective August 1, 2025. ...]".
// The whole requirement as it now reads took effect on that date, which is the date the challenge brief itself quotes for such
// sections (e.g. "G.L. c.112 §87DDD½ (8/1/2025)"). A note on the superseded text ("Text of section effective until ...") is not.
const CURRENT_VERSION_NOTE = /\[\s*text\s+of\s+(?:the\s+)?section\s+as\s+amended\s+by\b[^\]]*$/i;

/**
 * How the document words `date`:
 * - stated: at least one mention is an ordinary statement of the date.
 * - version_note: no ordinary statement, but at least one mention is the effective date of the section's current text in a
 *   code publisher's version note ("[ Text of section as amended by ... effective <date>. ...]"). Accepted.
 * - amendment_note: every mention sits in a history note of the latest amendment ("Amended by ... Effective January 1, 2026",
 *   "Repealed and added by ..."). That is when the current wording took effect, not when the law first applied.
 * - period_start: every mention opens a date range ("effective March 1, 2026 through February 28, 2027"): the start of a
 *   rate period, not the law's effective date.
 * - not_found: the date is not written in the document (a date computed from relative wording, for example).
 * - partial: a year or month only; not checked.
 */
export function effectiveDateContext(docText: string, date: string): DateContext {
  const pattern = dateVariants(date); if (!pattern) return 'partial';
  let found = 0; let amendment = 0; let period = 0; let version = 0;
  for (const hit of docText.matchAll(pattern)) {
    found++;
    const at = hit.index!;
    const lineStart = Math.max(docText.lastIndexOf('\n', at) + 1, at - 400);
    const bracketStart = Math.max(docText.lastIndexOf('[', at), at - 400);
    if (CURRENT_VERSION_NOTE.test(docText.slice(bracketStart, at))) { version++; amendment++; }
    else if (AMENDED_BEFORE.test(docText.slice(lineStart, at))) amendment++;
    else if (RANGE_AFTER.test(docText.slice(at + hit[0].length, at + hit[0].length + 60))) period++;
  }
  if (!found) return 'not_found';
  if (amendment + period < found) return 'stated';
  if (version > 0 && amendment >= period) return 'version_note';
  return amendment >= period ? 'amendment_note' : 'period_start';
}
export const REJECTED_DATE_REASON: Partial<Record<DateContext, string>> = {
  amendment_note: 'the document gives it only as the date of the latest amendment',
  period_start: 'the document gives it only as the start of a rate period'
};

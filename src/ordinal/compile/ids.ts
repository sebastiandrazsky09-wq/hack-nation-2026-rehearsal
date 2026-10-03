import { createHash } from 'node:crypto';
import { levelOf, stateOf, type Category } from '../contracts';

export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

const CATEGORY_CODES: Record<Category, string> = {
  rent_increase_limits: 'RENT', just_cause_eviction: 'EVICT', security_deposits: 'DEP',
  application_screening_fees: 'FEE', screening_restrictions: 'SCREEN', algorithmic_rent_setting: 'ALG'
};

/** Lowercase, section sign and the words section/sec. removed, whitespace collapsed. */
export function normalizeCitation(citation: string): string {
  return citation.toLowerCase().replace(/§/g, ' ').replace(/\b(?:sections?|sec)\b\.?/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `<ST>[-<CITY>]-<CATEGORY CODE>-<6 hex>`: stable across recompiles, derived only from jurisdiction, category and citation. */
export function teamRuleId(jurisdiction: string, category: Category, citation: string): string {
  const parts = [stateOf(jurisdiction).toUpperCase()];
  if (levelOf(jurisdiction) === 'city') parts.push(jurisdiction.split(',')[0].trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  parts.push(CATEGORY_CODES[category], sha256(`${jurisdiction}|${category}|${normalizeCitation(citation)}`).slice(0, 6));
  return parts.join('-');
}

const unifyDashes = (s: string) => s.replace(/[‐-―−]/g, '-');

/** True when every numeric or section token of the citation occurs in the document. A citation without such a token cannot be confirmed. */
export function citationInSource(citation: string, docText: string): boolean {
  const tokens = unifyDashes(citation).match(/(?<![\w(])\d[0-9A-Za-z]*(?:[.:-][0-9A-Za-z]+)*/g);
  if (!tokens?.length) return false;
  const haystack = unifyDashes(docText);
  return tokens.every(token => haystack.includes(token));
}

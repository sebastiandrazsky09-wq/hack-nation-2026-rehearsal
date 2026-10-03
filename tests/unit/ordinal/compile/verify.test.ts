import { describe, it, expect } from 'vitest';
import { verifyQuote } from '../../../../src/ordinal/compile';
import { chunkDocument } from '../../../../src/ordinal/compile/chunk';
import { citationInSource, normalizeCitation, teamRuleId } from '../../../../src/ordinal/compile/ids';

const DOC = 'SOURCE: https://example.test/x\nRETRIEVED: 2026-01-01\n\nSection 12–14.  The tenant’s deposit shall\nnot exceed “two months” rent — except as\nstated in § 5.\n\nA second paragraph that is unrelated to the first.\n';

describe('verifyQuote', () => {
  it('does not verify a quote with one changed word', () => {
    const r = verifyQuote(DOC, 'The tenant’s deposit shall not exceed “two months” rent — except as listed in § 5.');
    expect(r.verified).toBe(false);
    expect(r.method).toBe('failed');
    expect(r.span_start).toBeNull();
  });

  it('verifies whitespace, quote-mark and dash differences and returns the document wording', () => {
    const quote = 'The tenant\'s deposit shall not exceed "two months" rent - except as stated in 5.';
    const r = verifyQuote(DOC, quote);
    expect(r.verified).toBe(true);
    expect(r.method).toBe('normalized');
    if (!r.verified) return;
    expect(r.quoted_span).toBe(DOC.slice(r.span_start, r.span_end));
    expect(r.quoted_span.startsWith('The tenant’s')).toBe(true);
    expect(r.quoted_span.endsWith('stated in § 5.')).toBe(true);
    expect(r.quoted_span).toContain('—');
  });

  it('verifies an exact quote with exact offsets', () => {
    const r = verifyQuote(DOC, 'A second paragraph that is unrelated to the first.');
    expect(r).toMatchObject({ verified: true, method: 'exact' });
    if (r.verified) expect(DOC.slice(r.span_start, r.span_end)).toBe(r.quoted_span);
  });

  it('rejects quotes under 20 characters', () => {
    expect(verifyQuote(DOC, 'A second paragraph').verified).toBe(false);
  });
});

describe('chunkDocument', () => {
  const doc = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ` + 'word '.repeat(30)).join('\n\n');
  it('returns one chunk for a short document', () => {
    expect(chunkDocument('short')).toEqual([{ index: 0, start: 0, text: 'short' }]);
  });
  it('splits at paragraph boundaries with overlap and correct start offsets', () => {
    const chunks = chunkDocument(doc, 5000, 500);
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(doc.slice(c.start, c.start + c.text.length)).toBe(c.text);
      expect(c.text.length).toBeLessThanOrEqual(5000);
      if (i > 0) {
        const prev = chunks[i - 1];
        expect(c.start).toBeGreaterThan(prev.start);
        expect(c.start).toBeLessThan(prev.start + prev.text.length);
        expect(doc.slice(c.start - 1, c.start).endsWith('\n')).toBe(true);
      }
    });
    const last = chunks[chunks.length - 1];
    expect(last.start + last.text.length).toBe(doc.length);
  });
});

describe('rule ids and citations', () => {
  it('derives a stable id from jurisdiction, category and normalized citation only', () => {
    const a = teamRuleId('Hoboken, NJ', 'security_deposits', 'Section 12-3');
    expect(a).toMatch(/^NJ-HOBOKEN-DEP-[0-9a-f]{6}$/);
    expect(teamRuleId('Hoboken, NJ', 'security_deposits', '  § 12-3 ')).toBe(a);
    expect(teamRuleId('NJ', 'security_deposits', '12-3')).toMatch(/^NJ-DEP-[0-9a-f]{6}$/);
    expect(teamRuleId('Santa Ana, CA', 'rent_increase_limits', 'x 1')).toMatch(/^CA-SANTA-ANA-RENT-/);
    expect(normalizeCitation('Sec. 12  § 3')).toBe('12 3');
  });
  it('checks every numeric token of a citation against the source', () => {
    expect(citationInSource('Code § 12-14(a)(1)', DOC)).toBe(true);
    expect(citationInSource('Code § 12-15', DOC)).toBe(false);
    expect(citationInSource('Unnumbered act', DOC)).toBe(false);
  });
});

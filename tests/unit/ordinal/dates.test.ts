import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { effectiveDateContext } from '../../../src/ordinal/dates';
import { PATHS } from '../../../src/ordinal/corpus';

const doc = (id: string) => readFileSync(`${PATHS.pack}/corpus/text/${id}.txt`, 'utf8');

describe('how a document words a date', () => {
  it('rejects the latest-amendment date of a codified statute (supplied texts)', () => {
    expect(effectiveDateContext(doc('D023'), '2026-01-01')).toBe('amendment_note');
    expect(effectiveDateContext(doc('D024'), '2024-01-01')).toBe('amendment_note');
    expect(effectiveDateContext(doc('D025'), '2026-01-01')).toBe('amendment_note');
    expect(effectiveDateContext(doc('D026'), '2026-01-01')).toBe('amendment_note');
    expect(effectiveDateContext(doc('D027'), '2024-01-01')).toBe('amendment_note');
  });
  it('accepts the effective date of the current text in a code publisher version note (supplied text)', () => {
    // The brief cites this section as "G.L. c.112 §87DDD½ (8/1/2025)": the date the current text took effect.
    expect(effectiveDateContext(doc('D057'), '2025-08-01')).toBe('version_note');
    const page = '[ Text of section effective until August 1, 2025.  For text effective August 1, 2025, see below.]\nold text\n[ Text of section as amended by 2025, 9, Sec. 43 effective August 1, 2025.  See 2025, 9, Sec. 136.  For text effective until August 1, 2025, see above.]\nnew text';
    expect(effectiveDateContext(page, '2025-08-01')).toBe('version_note');
    // A superseded-text note alone is not the current text's date.
    expect(effectiveDateContext('[ Text of section effective until August 1, 2025.  For text effective August 1, 2025, see below.]', '2025-08-01')).toBe('amendment_note');
  });
  it('rejects the start of an annual rate period (supplied text)', () => {
    expect(effectiveDateContext(doc('D080'), '2026-03-01')).toBe('period_start');
    expect(effectiveDateContext(doc('D080'), '2025-03-01')).toBe('period_start');
  });
  it('accepts an ordinary statement, in the common written forms', () => {
    expect(effectiveDateContext('This ordinance shall take effect on March 1, 2027.', '2027-03-01')).toBe('stated');
    expect(effectiveDateContext('added 5-22-2025 by O-21955 N.S.; effective 6-21-2025.', '2025-06-21')).toBe('stated');
    expect(effectiveDateContext('Effective 10/14/24, landlords may not use the software.', '2024-10-14')).toBe('stated');
    expect(effectiveDateContext('in force from the 1st day of July, 2027', '2027-07-01')).toBe('stated');
    expect(effectiveDateContext('(Amended by Stats. 2025.) Separately: the cap applies from January 1, 2026.', '2026-01-01')).toBe('amendment_note');
    expect(effectiveDateContext('(Amended by Stats. 2025. Effective January 1, 2026.)\nThe cap first applied on January 1, 2026.', '2026-01-01')).toBe('stated');
  });
  it('does not judge a date the document never writes, or a partial date', () => {
    expect(effectiveDateContext('take effect on the first day of the twelfth month next following enactment', '2027-07-01')).toBe('not_found');
    expect(effectiveDateContext('anything', '2026')).toBe('partial');
    expect(effectiveDateContext('rates for 3/1/26 - 2/28/27', '2026-03-01')).toBe('period_start');
    expect(effectiveDateContext('rates for 13/1/26', '2026-03-01')).toBe('not_found');
  });
});

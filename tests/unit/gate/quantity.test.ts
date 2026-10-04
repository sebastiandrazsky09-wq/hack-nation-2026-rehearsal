import { describe, expect, it } from 'vitest';
import { containsText, parseQuantity } from '../../../src/gate/quantity';

describe('parseQuantity reads one figure from quoted words, or nothing', () => {
  it.each([
    ['one and one-half times one month\'s rent', 1.5],
    ['one and one‑half times the monthly rent', 1.5],
    ['1 1/2 months', 1.5],
    ['two months\' rent', 2],
    ['an amount equal to two times the monthly rent', 2],
    ['the first month\'s rent', 1],
    ['one month’s rent', 1],
    ['3 months', 3],
    ['twice the monthly rent', 2]
  ])('months: %s -> %s', (text, expected) => { expect(parseQuantity(text, 'amount_months_rent')).toBe(expected); });

  it.each([
    ['$50', 50], ['which exceeds $50', 50], ['$ 1,250.50', 1250.5], ['75 dollars', 75]
  ])('dollars: %s -> %s', (text, expected) => { expect(parseQuantity(text, 'fee_usd')).toBe(expected); });

  it('gives nothing when the words state two different figures', () => {
    expect(parseQuantity('one month\'s rent, or two months\' rent for a furnished unit', 'amount_months_rent')).toBeNull();
    expect(parseQuantity('$30 or $50', 'fee_usd')).toBeNull();
  });
  it('gives nothing when the words state no figure', () => {
    expect(parseQuantity('a reasonable amount', 'amount_months_rent')).toBeNull();
    expect(parseQuantity('the actual cost of the report', 'fee_usd')).toBeNull();
    expect(parseQuantity('monthly rent', 'amount_months_rent')).toBeNull();
  });
  it('the same figure stated twice is one figure', () => {
    expect(parseQuantity('$50 (fifty dollars, $50)', 'fee_usd')).toBe(50);
  });
});

describe('containsText', () => {
  it('ignores quote marks, dashes and spacing only', () => {
    expect(containsText('not more than one and one‑half  times one month’s rent', "one and one-half times one month's rent")).toBe(true);
    expect(containsText('not more than two months', 'three months')).toBe(false);
    expect(containsText('anything', '')).toBe(false);
  });
});

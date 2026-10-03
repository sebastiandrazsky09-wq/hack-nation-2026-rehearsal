import type { Address } from '../contracts';

export type Variant = { variant: string; query: string };

const UNIT = /\s+(?:(?:APT|UNIT|STE|SUITE|FL|FLOOR)\.?\s*[A-Z0-9-]+|#\s*[A-Z0-9-]+|\d+\/\d+)\b/gi;
const HOUSE_LETTER = /^(\d+)[A-Z]\b/i;
const RANGE = /^(\d+)\s*-\s*(\d+)\s+(.+)$/;

const clean = (street: string) => street.trim().replace(/\s+/g, ' ');

/** Ordered query variants for one address; duplicates are dropped, the earliest label wins. */
export function buildVariants(address: Pick<Address, 'street_address' | 'postal_city' | 'state' | 'zip'>): Variant[] {
  const street = clean(address.street_address);
  const tail = `${address.postal_city}, ${address.state}`;
  const out: Variant[] = [];
  const add = (variant: string, query: string) => { if (!out.some(v => v.query === query)) out.push({ variant, query }); };

  add('as_given', address.zip ? `${street}, ${tail} ${address.zip}` : `${street}, ${tail}`);
  add('without_zip', `${street}, ${tail}`);

  const range = street.match(RANGE);
  let core = street;
  if (range) {
    core = `${range[1]} ${range[3]}`;
    add('range_first', `${core}, ${tail}`);
    add('range_last', `${range[2]} ${range[3]}, ${tail}`);
  }
  const noUnit = clean(core.replace(UNIT, ''));
  add('unit_removed', `${noUnit}, ${tail}`);
  add('house_letter_removed', `${noUnit.replace(HOUSE_LETTER, '$1')}, ${tail}`);
  return out;
}

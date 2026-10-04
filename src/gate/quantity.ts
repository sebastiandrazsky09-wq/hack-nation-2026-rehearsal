// Reads a figure out of quoted legal wording with fixed rules, so a number in a constraint never rests on a model's word alone.
// Returns null unless the words state exactly one figure.
import type { ParameterName } from './contract';

const WORDS: Record<string, number> = {
  one: 1, first: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};
const NUMBER = '(\\d+(?:\\.\\d+)?|one|first|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const value = (token: string): number => (/^\d/.test(token) ? Number(token) : WORDS[token]);
const fold = (text: string) => text.toLowerCase().replace(/[‘’′]/g, "'").replace(/[‐‑‒–—―−-]/g, ' ').replace(/\s+/g, ' ').trim();

function months(text: string): number[] {
  let t = fold(text);
  const found: number[] = [];
  // "one and one half times one month's rent": the trailing "one month's rent" is the unit, not a second figure.
  t = t.replace(/\btimes (?:the )?(?:one|a|1) month(?:'s|s')?(?: rent)?/g, ' times ');
  t = t.replace(new RegExp(`\\b${NUMBER} and (?:one|a) half\\b`, 'g'), (_, n: string) => { found.push(value(n) + 0.5); return ' '; });
  t = t.replace(/\b(\d+) 1\/2\b/g, (_, n: string) => { found.push(Number(n) + 0.5); return ' '; });
  t = t.replace(/\b(?:one half|half (?:of )?(?:a|one) month)\b/g, () => { found.push(0.5); return ' '; });
  t = t.replace(/\b(?:twice|double)\b/g, () => { found.push(2); return ' '; });
  t = t.replace(new RegExp(`\\b${NUMBER} (?:times|months?\\b)`, 'g'), (_, n: string) => { found.push(value(n)); return ' '; });
  return found;
}

function dollars(text: string): number[] {
  const t = text.replace(/\s+/g, ' ');
  const found: number[] = [];
  for (const m of t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)) found.push(Number(m[1].replace(/,/g, '')));
  for (const m of t.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s+dollars\b/gi)) found.push(Number(m[1].replace(/,/g, '')));
  return found;
}

/** The single figure the words state, in the parameter's unit, or null when they state none or more than one. */
export function parseQuantity(text: string, parameter: ParameterName): number | null {
  const distinct = [...new Set(parameter === 'fee_usd' ? dollars(text) : months(text))].filter(n => Number.isFinite(n));
  return distinct.length === 1 ? distinct[0] : null;
}

const squash = (text: string) => text.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[‐‑‒–—―−]/g, '-').replace(/\s+/g, ' ').trim();
/** True when `part` occurs in `whole`, quote marks, dashes and spacing aside. */
export function containsText(whole: string, part: string): boolean {
  const p = squash(part);
  return p.length > 0 && squash(whole).includes(p);
}

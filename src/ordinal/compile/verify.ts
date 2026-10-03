// Mechanical quote verification. A quote is verified only if it occurs in the document text, up to cosmetic differences.
export const MIN_QUOTE_LENGTH = 20;

export type QuoteVerification =
  | { verified: true; method: 'exact' | 'normalized'; span_start: number; span_end: number; quoted_span: string }
  | { verified: false; method: 'failed'; span_start: null; span_end: null; quoted_span: string };

type Normalized = { norm: string; start: number[]; end: number[] };

/** Cosmetic folds only: curly to straight quotes, every dash to a hyphen; section signs and invisible characters vanish. */
function fold(c: string): string {
  if ('‘’‚‛′'.includes(c)) return "'";
  if ('“”„‟″'.includes(c)) return '"';
  if ('‐‑‒–—―−'.includes(c)) return '-';
  if ('§­​‌‍⁠'.includes(c)) return '';
  return c;
}

/** `start[i]`/`end[i]` give the original offsets of normalized character i, so a match maps back to the source. */
function normalize(text: string): Normalized {
  const out: string[] = []; const start: number[] = []; const end: number[] = [];
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (inSpace) end[end.length - 1] = i + 1;
      else { out.push(' '); start.push(i); end.push(i + 1); inSpace = true; }
      continue;
    }
    const f = fold(c);
    if (f === '') continue;
    out.push(f); start.push(i); end.push(i + 1); inSpace = false;
  }
  return { norm: out.join(''), start, end };
}

let memo: { text: string; value: Normalized } | null = null;
function normalizedDoc(text: string): Normalized {
  if (memo?.text !== text) memo = { text, value: normalize(text) };
  return memo.value;
}

const failed = (quote: string): QuoteVerification => ({ verified: false, method: 'failed', span_start: null, span_end: null, quoted_span: quote });

/** The returned `quoted_span` is always `docText.slice(span_start, span_end)`, never the model's wording. */
export function verifyQuote(docText: string, quote: string): QuoteVerification {
  const q = quote.trim();
  if (q.length < MIN_QUOTE_LENGTH) return failed(quote);
  const at = docText.indexOf(q);
  if (at >= 0) return { verified: true, method: 'exact', span_start: at, span_end: at + q.length, quoted_span: docText.slice(at, at + q.length) };
  const nq = normalize(q).norm.trim();
  if (nq.length < MIN_QUOTE_LENGTH) return failed(quote);
  const doc = normalizedDoc(docText);
  const idx = doc.norm.indexOf(nq);
  if (idx < 0) return failed(quote);
  const span_start = doc.start[idx]; const span_end = doc.end[idx + nq.length - 1];
  const quoted_span = docText.slice(span_start, span_end);
  if (quoted_span.length < MIN_QUOTE_LENGTH) return failed(quote);
  return { verified: true, method: 'normalized', span_start, span_end, quoted_span };
}

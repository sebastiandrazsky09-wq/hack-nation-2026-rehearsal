// Long documents are split so each model call stays small. Offsets always refer to the full document text.
export const CHUNK_MAX = 24000;
export const CHUNK_OVERLAP = 1500;
export type Chunk = { index: number; /** Offset of `text` in the full document. */ start: number; text: string };

/** Prefer a blank line, then a line break, in the second half of the window; otherwise cut hard. */
function cutPoint(text: string, start: number, end: number): number {
  const lowest = start + Math.floor((end - start) / 2);
  const blank = text.lastIndexOf('\n\n', end - 2);
  if (blank >= lowest) return blank + 2;
  const line = text.lastIndexOf('\n', end - 1);
  if (line >= lowest) return line + 1;
  return end;
}

export function chunkDocument(text: string, max = CHUNK_MAX, overlap = CHUNK_OVERLAP): Chunk[] {
  if (text.length <= max) return [{ index: 0, start: 0, text }];
  const chunks: Chunk[] = [];
  let start = 0;
  for (;;) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) end = cutPoint(text, start, end);
    chunks.push({ index: chunks.length, start, text: text.slice(start, end) });
    if (end >= text.length) return chunks;
    let next = end - overlap;
    const lineBreak = text.indexOf('\n', next);
    if (lineBreak !== -1 && lineBreak + 1 < end) next = lineBreak + 1;
    start = Math.max(next, start + 1);
  }
}

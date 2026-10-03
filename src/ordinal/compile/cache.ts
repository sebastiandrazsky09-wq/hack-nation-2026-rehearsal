// One JSON file per document chunk. The key covers everything that changes the model's answer.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { sha256 } from './ids';
import { PROMPT_VERSION } from './prompt';
import { RawRuleSchema, type RawRule } from './schema';

const EntrySchema = z.object({
  doc_id: z.string(),
  chunk_index: z.number().int(),
  prompt_version: z.string(),
  model: z.string(),
  rules: z.array(RawRuleSchema),
  /** Repaired quotes by repairKey, so a rerun needs no repair call either. */
  repairs: z.record(z.string(), z.string())
});
export type CacheEntry = z.infer<typeof EntrySchema>;

export const chunkKey = (chunkText: string, model: string, allowedJurisdictions: string[]) => sha256(JSON.stringify([chunkText, PROMPT_VERSION, model, allowedJurisdictions]));
export const repairKey = (rule: RawRule) => sha256(JSON.stringify([rule.quoted_span, rule.citation, rule.title]));

export function readEntry(dir: string, key: string): CacheEntry | null {
  const file = path.join(dir, `${key}.json`);
  if (!existsSync(file)) return null;
  try { return EntrySchema.parse(JSON.parse(readFileSync(file, 'utf8'))); } catch { return null; }
}
export function writeEntry(dir: string, key: string, entry: CacheEntry): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(entry, null, 1) + '\n');
}

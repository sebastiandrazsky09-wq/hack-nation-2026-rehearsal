// Documents added after kickoff. The file is stored byte-for-byte; provenance that the file itself lacks goes in index.json beside it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseDocHeader, type SourceDoc } from '../corpus';
import { sha256 } from './ids';

const INDEX_FILE = 'index.json';
type IndexEntry = { jurisdiction: string | null; source_url: string; retrieved_at: string };
type Index = Record<string, IndexEntry>;

/** 'ST' or 'City, ST'. */
export const isJurisdictionShape = (value: string) => /^[A-Z]{2}$/.test(value) || /^.+, [A-Z]{2}$/.test(value);

const readIndex = (dir: string): Index => {
  const file = path.join(dir, INDEX_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Index : {};
};

function docFromFile(file: string, index: Index): SourceDoc {
  const buffer = readFileSync(file);
  const doc_id = 'X' + sha256(buffer).slice(0, 7);
  const entry = index[doc_id];
  const text = buffer.toString('utf8');
  const header = parseDocHeader(text);
  const name = path.basename(file).replace(new RegExp(`^${doc_id}_`), '');
  return {
    doc_id, jurisdiction: entry?.jurisdiction ?? null,
    source_url: header.source_url ?? entry?.source_url ?? `ingested:${name}`,
    retrieved_at: header.retrieved_at ?? entry?.retrieved_at ?? null,
    origin: 'ingested', path: path.relative(ROOT, file), text
  };
}

/** Every file in the ingest directory (the index excepted), in doc_id order. */
export function loadIngestedDocs(dir: string): SourceDoc[] {
  if (!existsSync(dir)) return [];
  const index = readIndex(dir);
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name !== INDEX_FILE && !e.name.startsWith('.'))
    .map(e => docFromFile(path.join(dir, e.name), index))
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

export function ingestFile(source: string, dir: string, jurisdiction: string | undefined, now: Date): SourceDoc {
  if (jurisdiction !== undefined && !isJurisdictionShape(jurisdiction)) throw new Error(`ingest jurisdiction "${jurisdiction}" must look like "ST" or "City, ST"`);
  const buffer = readFileSync(source);
  const doc_id = 'X' + sha256(buffer).slice(0, 7);
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${doc_id}_${path.basename(source)}`);
  writeFileSync(dest, buffer);
  const index = readIndex(dir);
  const prior = index[doc_id];
  index[doc_id] = {
    jurisdiction: jurisdiction ?? prior?.jurisdiction ?? null,
    source_url: prior?.source_url ?? `ingested:${path.basename(source)}`,
    retrieved_at: prior?.retrieved_at ?? now.toISOString()
  };
  writeFileSync(path.join(dir, INDEX_FILE), JSON.stringify(Object.fromEntries(Object.keys(index).sort().map(k => [k, index[k]])), null, 1) + '\n');
  return docFromFile(dest, index);
}

// Documents added after kickoff. The file is stored byte-for-byte; provenance that the file itself lacks goes in index.json beside it.
import { execFileSync } from 'node:child_process';
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

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m);
const tidy = (s: string) => s.replace(/[ \t\u00a0]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
/** Visible text of an HTML page: scripts and styles dropped, block elements become line breaks. */
export function htmlToText(html: string): string {
  const body = html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n');
  return tidy(decode(body.replace(/<[^>]+>/g, ' ')));
}
/** Text of a Word document's word/document.xml: one line per paragraph. */
export function docxXmlToText(xml: string): string {
  return tidy(decode(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')));
}
/**
 * Loader-level conversion for a document that is not plain text. Returns null for text files, which are stored byte for byte.
 * Nothing here looks at what the document says.
 */
export function convertToText(source: string, buffer: Buffer): { text: string; method: string } | null {
  const ext = path.extname(source).toLowerCase();
  if (ext === '.pdf' || buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { text: tidyPages(execFileSync('pdftotext', ['-layout', source, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })), method: 'pdftotext -layout' };
  if (ext === '.docx') return { text: docxXmlToText(execFileSync('unzip', ['-p', source, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })), method: 'word/document.xml, tags removed' };
  if (ext === '.html' || ext === '.htm' || /^\s*<(!doctype html|html)\b/i.test(buffer.subarray(0, 300).toString('utf8'))) return { text: htmlToText(buffer.toString('utf8')), method: 'HTML tags removed' };
  return null;
}
const tidyPages = (s: string) => s.replace(/\f/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').trim();

export function ingestFile(source: string, dir: string, jurisdiction: string | undefined, now: Date): SourceDoc {
  if (jurisdiction !== undefined && !isJurisdictionShape(jurisdiction)) throw new Error(`ingest jurisdiction "${jurisdiction}" must look like "ST" or "City, ST"`);
  const original = readFileSync(source);
  const converted = convertToText(source, original);
  // A converted document is stored as text with one line saying how it was made; the original is kept beside it, byte for byte.
  const buffer = converted ? Buffer.from(`CONVERTED: ${converted.method} from ${path.basename(source)} (sha256 ${sha256(original)})\n\n${converted.text}\n`, 'utf8') : original;
  const doc_id = 'X' + sha256(buffer).slice(0, 7);
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${doc_id}_${path.basename(source)}${converted ? '.txt' : ''}`);
  writeFileSync(dest, buffer);
  if (converted) { mkdirSync(path.join(dir, 'originals'), { recursive: true }); writeFileSync(path.join(dir, 'originals', `${doc_id}_${path.basename(source)}`), original); }
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

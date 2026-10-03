// FROZEN CONTRACT. Lead-owned. Shared loaders and file locations; no module reads the pack or the store any other way.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { AddressSchema, InternalRuleSchema, JurisdictionStackSchema, type Address, type InternalRule, type JurisdictionStack } from './contracts';

export const ROOT = process.env.ORDINAL_ROOT ?? process.cwd();
export const PATHS = {
  pack: path.join(ROOT, 'official/pack'),
  manifest: path.join(ROOT, 'official/pack/corpus/corpus_manifest.csv'),
  addresses: path.join(ROOT, 'official/pack/data/sample_addresses.csv'),
  ruleSchema: path.join(ROOT, 'official/pack/schema/rule_record.schema.json'),
  changeTests: path.join(ROOT, 'official/pack/dev/change_tests.json'),
  templates: path.join(ROOT, 'official/pack/submission_templates'),
  /** Team-captured pages for manifest rows that had no supplied text. Never mixed into official/pack. */
  supplementalText: path.join(ROOT, 'supplemental/text'),
  /** Documents added after kickoff through `ordinal ingest`. */
  ingested: path.join(ROOT, 'store/ingested'),
  ruleStore: path.join(ROOT, 'store/rules.jsonl'),
  extractionCache: path.join(ROOT, 'store/extraction'),
  geocodeCache: path.join(ROOT, 'store/geocode'),
  stacks: path.join(ROOT, 'store/stacks.json'),
  out: path.join(ROOT, 'out')
};

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. Strips a BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  body.forEach((r, i) => { if (r.length !== header.length) throw new Error(`CSV row ${i + 2} has ${r.length} fields, expected ${header.length}`); });
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

export type ManifestRow = { doc_id: string; jurisdictions: string; url: string; source_type: string; capture: string; retrieved_at: string; sha256: string; text_file: string; status: string };
export function loadManifest(): ManifestRow[] { return parseCsv(readFileSync(PATHS.manifest, 'utf8')) as ManifestRow[]; }

export type SourceDoc = {
  doc_id: string;
  /** Manifest jurisdiction: 'CA' or 'City, ST'. Null only for an ingested document with no manifest row. */
  jurisdiction: string | null;
  source_url: string;
  retrieved_at: string | null;
  origin: 'official_captured' | 'supplemental' | 'ingested';
  /** Repo-relative path of the text file. */
  path: string;
  /** Full file content exactly as stored, header lines included. Quote offsets index into this string. */
  text: string;
};
/** Every text file starts with `SOURCE: <url>` and `RETRIEVED: <date>` lines. */
export function parseDocHeader(text: string): { source_url: string | null; retrieved_at: string | null } {
  const head = text.slice(0, 2000);
  return { source_url: head.match(/^SOURCE:[ \t]*(\S+)[ \t]*$/m)?.[1] ?? null, retrieved_at: head.match(/^RETRIEVED:[ \t]*(\S.*)$/m)?.[1]?.trim() ?? null };
}
function docFrom(file: string, doc_id: string, origin: SourceDoc['origin'], row: ManifestRow | undefined): SourceDoc {
  const text = readFileSync(file, 'utf8'); const header = parseDocHeader(text);
  return { doc_id, jurisdiction: row?.jurisdictions || null, source_url: header.source_url ?? row?.url ?? '', retrieved_at: header.retrieved_at ?? row?.retrieved_at ?? null, origin, path: path.relative(ROOT, file), text };
}
/** Supplied captured texts (manifest status ok), in doc_id order. */
export function loadOfficialDocs(): SourceDoc[] {
  return loadManifest().filter(r => r.status === 'ok' && r.text_file).sort((a, b) => a.doc_id.localeCompare(b.doc_id))
    .map(r => docFrom(path.join(PATHS.pack, 'corpus', r.text_file), r.doc_id, 'official_captured', r));
}
/** Team-captured pages for link-only manifest rows; provenance stays `supplemental`. */
export function loadSupplementalDocs(): SourceDoc[] {
  const rows = new Map(loadManifest().map(r => [r.doc_id, r]));
  return [...rows.keys()].sort().filter(id => existsSync(path.join(PATHS.supplementalText, id + '.txt')))
    .map(id => docFrom(path.join(PATHS.supplementalText, id + '.txt'), id, 'supplemental', rows.get(id)));
}

const int = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);
export function loadAddresses(): Address[] {
  return parseCsv(readFileSync(PATHS.addresses, 'utf8')).map(r => AddressSchema.parse({ ...r, year_built: int(r.year_built), units: int(r.units) }));
}

/** A stored rule may claim `verified` only with a real span; the two verification fields may never contradict each other. */
export function assertRuleInvariants(rule: InternalRule): InternalRule {
  const span = rule.span_start !== null && rule.span_end !== null && rule.span_end > rule.span_start && rule.span_end - rule.span_start === rule.quoted_span.length;
  if (rule.verified && (rule.verification_method === 'failed' || !span)) throw new Error(`${rule.team_rule_id}: verified=true needs a verification method and span offsets matching quoted_span`);
  if (!rule.verified && rule.verification_method !== 'failed') throw new Error(`${rule.team_rule_id}: verified=false must carry verification_method "failed"`);
  return rule;
}
/** The stored quote is still the literal slice of this document. Checked again at export, not trusted from the store. */
export function quoteMatchesSource(rule: Pick<InternalRule, 'verified' | 'span_start' | 'span_end' | 'quoted_span'>, docText: string): boolean {
  return rule.verified && rule.span_start !== null && rule.span_end !== null && docText.slice(rule.span_start, rule.span_end) === rule.quoted_span;
}
export function readRuleStore(file = PATHS.ruleStore): InternalRule[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => assertRuleInvariants(InternalRuleSchema.parse(JSON.parse(line))));
}
/** Sorted by team_rule_id so the file is byte-identical for identical rules. */
export function writeRuleStore(rules: InternalRule[], file = PATHS.ruleStore): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = [...rules].sort((a, b) => a.team_rule_id.localeCompare(b.team_rule_id)).map(r => assertRuleInvariants(InternalRuleSchema.parse(r)));
  writeFileSync(file, sorted.map(r => JSON.stringify(r)).join('\n') + (sorted.length ? '\n' : ''));
}
export function readStacks(file = PATHS.stacks): Record<string, JurisdictionStack> {
  if (!existsSync(file)) return {};
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).map(([id, value]) => [id, JurisdictionStackSchema.parse(value)]));
}
export function writeStacks(stacks: Record<string, JurisdictionStack>, file = PATHS.stacks): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = Object.fromEntries(Object.keys(stacks).sort().map(id => [id, JurisdictionStackSchema.parse(stacks[id])]));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
}

// Recomputes everything from the store; nothing is read from a previous export.
import { effectiveDateContext, REJECTED_DATE_REASON } from '../dates';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadIngestedDocs } from '../compile/ingest';
import { CATEGORIES, DEFAULT_AS_OF, KNOWN_JURISDICTIONS, type InternalRule } from '../contracts';
import { PATHS, loadAddresses, loadManifest, loadOfficialDocs, loadSupplementalDocs, quoteMatchesSource, readRuleStore, readStacks, type ManifestRow } from '../corpus';
import type { SelfcheckReport } from '../entrypoints';
import { EXPORT_FILES, type BuildResult, type ExportDeps } from '../export/build';
import { exportToDir } from '../export';
import { deriveStatus } from '../status';

export type SelfcheckDeps = ExportDeps & { asOf?: string; /** Extraction cache directory. */ cacheDir?: string; manifest?: ManifestRow[] };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const countBy = (items: string[]) => JSON.stringify(Object.fromEntries([...new Set(items)].sort(cmp).map(k => [k, items.filter(i => i === k).length])));
const sample = (items: string[], n = 5) => items.slice(0, n).join(', ') + (items.length > n ? `, ... (${items.length} total)` : '');

/** doc_ids that have at least one extraction cache entry. */
function cachedDocIds(dir: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(dir)) return ids;
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    try { const entry = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as { doc_id?: unknown }; if (typeof entry.doc_id === 'string') ids.add(entry.doc_id); } catch { /* unreadable entry: not evidence of processing */ }
  }
  return ids;
}

export async function runSelfcheck(deps: SelfcheckDeps = {}): Promise<SelfcheckReport> {
  const asOf = deps.asOf ?? DEFAULT_AS_OF;
  const rules = deps.rules ?? readRuleStore();
  const stacks = deps.stacks ?? readStacks();
  const addresses = deps.addresses ?? loadAddresses();
  const docs = deps.docs ?? [...loadOfficialDocs(), ...loadSupplementalDocs(), ...loadIngestedDocs(PATHS.ingested)];
  const manifest = deps.manifest ?? loadManifest();
  const shared: ExportDeps = { ...deps, rules, stacks, addresses, docs };

  // Two full exports into temp directories; the first one supplies the data checked below.
  const dirs = [mkdtempSync(path.join(tmpdir(), 'ordinal-selfcheck-')), mkdtempSync(path.join(tmpdir(), 'ordinal-selfcheck-'))];
  let build: BuildResult; const differing: string[] = [];
  try {
    build = exportToDir(asOf, dirs[0], shared);
    exportToDir(asOf, dirs[1], shared);
    for (const name of EXPORT_FILES) if (readFileSync(path.join(dirs[0], name), 'utf8') !== readFileSync(path.join(dirs[1], name), 'utf8')) differing.push(name);
  } finally { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); }

  const exportedIds = new Set(build.exported.map(r => r.team_rule_id));
  const ruleById = new Map<string, InternalRule>(build.exported.map(r => [r.team_rule_id, r]));
  const docText = new Map(docs.map(d => [d.doc_id, d.text]));
  const processed = cachedDocIds(deps.cacheDir ?? PATHS.extractionCache);
  for (const rule of rules) processed.add(rule.source_doc_id);
  const docsOf = (origin: string) => docs.filter(d => d.origin === origin);
  const stackList = Object.values(stacks);
  const rows = build.addresses.flatMap(a => (build.lookups[a.address_id] ?? []).map(row => ({ address_id: a.address_id, ...row })));
  const covered = new Set(build.exported.map(r => `${r.jurisdiction}|${r.category}`));

  const metrics: Record<string, number | string> = {
    official_docs_expected: manifest.filter(r => r.status === 'ok' && r.text_file).length,
    official_docs_processed: manifest.filter(r => r.status === 'ok' && r.text_file && processed.has(r.doc_id)).length,
    supplemental_docs_available: docsOf('supplemental').length,
    supplemental_docs_processed: docsOf('supplemental').filter(d => processed.has(d.doc_id)).length,
    ingested_docs: docsOf('ingested').length,
    rules_total: rules.length,
    rules_verified: rules.filter(r => r.verified).length,
    rules_unverified: rules.filter(r => !r.verified).length,
    rules_exported: build.exported.length,
    rules_withheld: build.withheld.length,
    rules_by_jurisdiction: countBy(build.exported.map(r => r.jurisdiction)),
    rules_by_category: countBy(build.exported.map(r => r.category)),
    rules_citation_not_in_source: build.exported.filter(r => !r.citation_in_source).length,
    rules_supplemental_only: build.exported.filter(r => r.source_origin !== 'official_captured').length,
    conflicts: new Set([...build.exported.filter(r => r.conflict_flag).map(r => r.team_rule_id), ...rows.filter(r => r.conflict_flag).map(r => r.team_rule_id)]).size,
    addresses_total: addresses.length,
    addresses_resolved: addresses.filter(a => stacks[a.address_id] && stacks[a.address_id].method !== 'unresolved').length,
    resolve_methods: countBy(stackList.map(s => s.method)),
    lookup_addresses: Object.keys(build.lookups).length,
    lookup_rows: build.lookupRows,
    result_counts: JSON.stringify(build.resultCounts),
    schema_errors: build.schemaErrors.length,
    empty_cells: JSON.stringify(KNOWN_JURISDICTIONS.flatMap(j => CATEGORIES.map(c => `${j}|${c}`)).filter(cell => !covered.has(cell)))
  };

  const failures: string[] = [];
  if (build.schemaErrors.length) failures.push(`${build.schemaErrors.length} schema error(s): ${sample(build.schemaErrors, 3)}`);
  if (build.exported.length === 0) failures.push('zero rules exported');
  const stale = build.exported.filter(r => !quoteMatchesSource(r, docText.get(r.source_doc_id) ?? '')).map(r => r.team_rule_id);
  if (stale.length) failures.push(`exported rule(s) whose quote does not match the source document: ${sample(stale)}`);
  // An exported effective date must be worded as one somewhere in the rule's documents, or not written at all (computed).
  const misdated = build.exported.filter(r => {
    if (!r.effective_date) return false;
    const contexts = [r.source_doc_id, ...r.also_supported_by.map(s => s.source_doc_id)].map(id => effectiveDateContext(docText.get(id) ?? '', r.effective_date!));
    return !contexts.includes('stated') && contexts.some(c => c in REJECTED_DATE_REASON);
  }).map(r => r.team_rule_id);
  if (misdated.length) failures.push(`effective date taken from an amendment note or a rate period: ${sample(misdated)}`);
  const orphan = [...new Set(rows.filter(r => !exportedIds.has(r.team_rule_id)).map(r => `${r.address_id}->${r.team_rule_id}`))];
  if (orphan.length) failures.push(`lookup row(s) point at a rule that is not exported: ${sample(orphan)}`);
  const uncovered = addresses.filter(a => !(a.address_id in build.lookups)).map(a => a.address_id);
  if (uncovered.length) failures.push(`lookups do not cover address(es): ${sample(uncovered)}`);
  const unresolved = stackList.filter(s => s.method === 'unresolved').map(s => s.address_id).sort(cmp);
  if (unresolved.length) failures.push(`${unresolved.length} unresolved jurisdiction stack(s): ${sample(unresolved)}`);

  const inactive = new Set<string>(); const notInForce = new Set<string>();
  for (const row of rows) {
    const rule = ruleById.get(row.team_rule_id);
    if (!rule) continue;
    const status = deriveStatus(rule, asOf);
    if ((status === 'pending' || status === 'failed') && ['applies', 'unknown', 'superseded'].includes(row.result)) inactive.add(`${row.team_rule_id} is ${status} but has result ${row.result}`);
    if (row.result === 'applies' && status !== 'in_force') notInForce.add(`${row.team_rule_id} (${status})`);
  }
  if (inactive.size) failures.push(`pending or failed rule(s) with an affirmative or open result: ${sample([...inactive].sort(cmp))}`);
  if (notInForce.size) failures.push(`"applies" result for rule(s) not in force at ${asOf}: ${sample([...notInForce].sort(cmp))}`);
  if (differing.length) failures.push(`two exports of the same inputs differ in: ${differing.join(', ')}`);

  return { ok: failures.length === 0, metrics, failures };
}

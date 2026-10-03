import { stateOf, levelOf, InternalRuleSchema, type InternalRule } from '../contracts';
import { PATHS, loadOfficialDocs, loadSupplementalDocs, readRuleStore, writeRuleStore, type SourceDoc } from '../corpus';
import type { CompileOptions, CompileReport, RunCompile } from '../entrypoints';
import { chunkDocument } from './chunk';
import { chunkKey, readEntry, repairKey, writeEntry, type CacheEntry } from './cache';
import { citationInSource, sha256, teamRuleId } from './ids';
import { ingestFile, isJurisdictionShape, loadIngestedDocs } from './ingest';
import { candidatesPath, numberCandidates, readCandidates, writeCandidates } from './candidates';
import { consolidate } from './consolidate';
import type { Candidate } from './merge';
import { PROMPT_VERSION } from './prompt';
import { configuredModelNames, createProviderClient } from './provider';
import { RawRuleListSchema, type LlmClient, type RawRule } from './schema';
import { verifyQuote } from './verify';

export { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';
export { createProviderClient } from './provider';
export { verifyQuote } from './verify';
export { chunkDocument } from './chunk';
export { teamRuleId, normalizeCitation, citationInSource } from './ids';
export { GROUP_PROMPT, GROUP_PROMPT_VERSION } from './prompt';
export { RawRuleSchema, type ExtractRequest, type GroupAnswer, type GroupRequest, type LlmClient, type RawRule, type RepairRequest } from './schema';

export type CompileDeps = {
  client?: LlmClient;
  /** Defaults to PATHS.ruleStore. */
  ruleStorePath?: string;
  /** Defaults to PATHS.extractionCache. */
  cacheDir?: string;
  /** Defaults to PATHS.ingested. */
  ingestDir?: string;
  /** Replaces the official + supplemental document set. Ingested documents are always added. */
  docs?: SourceDoc[];
  now?: () => Date;
};

type Counters = { llm_calls: number; cache_hits: number };

const allowedJurisdictions = (doc: SourceDoc): string[] => doc.jurisdiction ? [...new Set([doc.jurisdiction, stateOf(doc.jurisdiction)])] : [];

/**
 * Compile documents into verified rules. Per document: chunk, extract (cache first), verify every quote against the
 * full text, repair a failed quote once, build candidates. Candidates of all documents are saved beside the rule store,
 * grouped per (jurisdiction, category) by the model (cached), and merged into one rule per law.
 */
export async function runCompile(options: CompileOptions, deps: CompileDeps = {}): Promise<CompileReport> {
  const storePath = deps.ruleStorePath ?? PATHS.ruleStore;
  const cacheDir = deps.cacheDir ?? PATHS.extractionCache;
  const ingestDir = deps.ingestDir ?? PATHS.ingested;
  const offline = options.offline === true;
  const force = options.force === true && !offline;

  const ingested = options.ingestPath ? ingestFile(options.ingestPath, ingestDir, options.ingestJurisdiction, (deps.now ?? (() => new Date()))()) : null;
  const known = new Map<string, SourceDoc>();
  for (const doc of [...(deps.docs ?? [...loadOfficialDocs(), ...loadSupplementalDocs()]), ...loadIngestedDocs(ingestDir)]) if (!known.has(doc.doc_id)) known.set(doc.doc_id, doc);

  const requested = options.docs ?? (ingested ? [] : [...known.keys()]);
  const ids = [...new Set([...requested, ...(ingested ? [ingested.doc_id] : [])])].sort();
  const selected = ids.flatMap(id => known.has(id) ? [known.get(id)!] : []);
  const docs_failed: CompileReport['docs_failed'] = ids.filter(id => !known.has(id)).map(doc_id => ({ doc_id, error: 'unknown doc_id' }));

  let client = deps.client;
  const modelNames = client ? [client.model ?? configuredModelNames()[0]] : configuredModelNames();
  const run_id = 'run-' + sha256(JSON.stringify([PROMPT_VERSION, modelNames[0], selected.map(d => [d.doc_id, sha256(d.text)])])).slice(0, 12);
  const counters: Counters = { llm_calls: 0, cache_hits: 0 };

  const entryFor = async (doc: SourceDoc, chunk: { index: number; text: string }, allowed: string[]): Promise<{ key: string; entry: CacheEntry }> => {
    if (!force) for (const model of modelNames) {
      const key = chunkKey(chunk.text, model, allowed);
      const hit = readEntry(cacheDir, key);
      if (hit) { counters.cache_hits++; return { key, entry: hit }; }
    }
    if (offline) throw new Error(`not cached (offline): chunk ${chunk.index + 1} of ${doc.doc_id}`);
    client ??= createProviderClient();
    const key = chunkKey(chunk.text, client.model ?? modelNames[0], allowed);
    const response = await client.extract({ doc, chunkIndex: chunk.index, chunkText: chunk.text, allowedJurisdictions: allowed });
    counters.llm_calls++;
    const entry: CacheEntry = { doc_id: doc.doc_id, chunk_index: chunk.index, prompt_version: PROMPT_VERSION, model: response.model, rules: RawRuleListSchema.parse({ rules: response.rules }).rules, repairs: {} };
    writeEntry(cacheDir, key, entry);
    return { key, entry };
  };

  const processDoc = async (doc: SourceDoc): Promise<{ rules: InternalRule[]; errors: string[] }> => {
    const rules: InternalRule[] = []; const errors: string[] = [];
    const allowed = allowedJurisdictions(doc);
    const chunks = chunkDocument(doc.text);
    for (const chunk of chunks) {
      const { key, entry } = await entryFor(doc, chunk, allowed);
      let dirty = false;
      for (const raw of entry.rules) {
        const label = `"${raw.title}" (${raw.citation})`;
        if (doc.jurisdiction ? !allowed.includes(raw.jurisdiction) : !isJurisdictionShape(raw.jurisdiction)) {
          errors.push(`dropped ${label}: jurisdiction "${raw.jurisdiction}" is not allowed${allowed.length ? ` (${allowed.join(', ')})` : ''}`);
          continue;
        }
        let verification: Verification = verifyQuote(doc.text, raw.quoted_span);
        let repaired: string | null = null;
        if (!verification.verified) {
          const rk = repairKey(raw);
          repaired = entry.repairs[rk] ?? null;
          if (repaired === null && !offline) {
            client ??= createProviderClient();
            repaired = (await client.repair({ doc, chunkText: chunk.text, rule: raw })).quoted_span;
            counters.llm_calls++;
            entry.repairs[rk] = repaired; dirty = true;
          }
          if (repaired !== null) {
            const second = verifyQuote(doc.text, repaired);
            if (second.verified) verification = { ...second, method: 'repaired' as const };
          }
        }
        // Per document, so a rule carries the same id whether its document was compiled alone or with the whole corpus.
        const record = buildRecord(doc, raw, verification, repaired, 'run-' + sha256(JSON.stringify([PROMPT_VERSION, modelNames[0], doc.doc_id, sha256(doc.text)])).slice(0, 12));
        if (!record) { errors.push(`dropped ${label}: quote shorter than 20 characters`); continue; }
        const parsed = InternalRuleSchema.safeParse(record);
        if (!parsed.success) { errors.push(`dropped ${label}: ${parsed.error.issues[0]?.message ?? 'invalid record'}`); continue; }
        rules.push(parsed.data);
      }
      if (dirty) writeEntry(cacheDir, key, entry);
    }
    return { rules, errors };
  };

  // Documents run in a small pool; results are collected by index so the store does not depend on completion order.
  const outcomes: ({ rules: InternalRule[]; errors: string[] } | { failure: string })[] = new Array(selected.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(Number(process.env.ORDINAL_CONCURRENCY ?? 4) || 1, selected.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < selected.length) {
      const i = cursor++;
      try { outcomes[i] = await processDoc(selected[i]); }
      catch (error) { outcomes[i] = { failure: error instanceof Error ? error.message : String(error) }; }
      if (process.env.ORDINAL_PROGRESS) console.error(`[compile] ${selected[i].doc_id} ${'failure' in outcomes[i] ? 'FAILED' : 'ok'}`);
    }
  }));
  const fresh: Candidate[] = []; const processed = new Set<string>();
  selected.forEach((doc, i) => {
    const outcome = outcomes[i];
    if ('failure' in outcome) { docs_failed.push({ doc_id: doc.doc_id, error: outcome.failure }); return; }
    fresh.push(...numberCandidates(doc.doc_id, outcome.rules)); processed.add(doc.doc_id);
    if (outcome.errors.length) docs_failed.push({ doc_id: doc.doc_id, error: outcome.errors.join('; ') });
  });

  // Candidates of documents not processed this run stay; consolidation always covers all of them and rewrites the whole store.
  const candidateFile = candidatesPath(storePath);
  let stored = readRuleStore(storePath);
  if (processed.size > 0) {
    const all = [...readCandidates(candidateFile).filter(c => !processed.has(c.rule.source_doc_id)), ...fresh];
    writeCandidates(all, candidateFile);
    const result = await consolidate(all, {
      cacheDir, modelNames, offline, force,
      client: () => (client ??= createProviderClient()),
      onCall: () => { counters.llm_calls++; }, onHit: () => { counters.cache_hits++; }
    });
    docs_failed.push(...result.failures);
    writeRuleStore(result.rules, storePath);
    stored = result.rules;
    if (process.env.ORDINAL_PROGRESS) console.error(`[compile] candidates=${all.length} cells=${result.cells} cells_grouped=${result.grouped} group_calls=${result.calls} rules=${result.rules.length}`);
  }

  return {
    run_id, docs_requested: ids.length, docs_processed: processed.size, docs_failed,
    rules_total: stored.length, rules_verified: stored.filter(r => r.verified).length, rules_unverified: stored.filter(r => !r.verified).length,
    llm_calls: counters.llm_calls, cache_hits: counters.cache_hits
  };
}

type Verification = ReturnType<typeof verifyQuote> | (Omit<Extract<ReturnType<typeof verifyQuote>, { verified: true }>, 'method'> & { method: 'repaired' });

function buildRecord(doc: SourceDoc, raw: RawRule, v: Verification, repaired: string | null, run_id: string): Record<string, unknown> | null {
  let quoted_span = v.quoted_span;
  if (!v.verified) {
    quoted_span = [raw.quoted_span, repaired ?? ''].find(q => q.length >= 20) ?? '';
    if (!quoted_span) return null;
  }
  return {
    team_rule_id: teamRuleId(raw.jurisdiction, raw.category, raw.citation),
    jurisdiction: raw.jurisdiction, level: levelOf(raw.jurisdiction), category: raw.category,
    title: raw.title, requirement: raw.requirement, key_value: raw.key_value, penalty: raw.penalty,
    citation: raw.citation, citation_in_source: citationInSource(raw.citation, doc.text),
    legal_status: raw.legal_status, enacted_date: raw.enacted_date, effective_date: raw.effective_date, repeal_date: raw.repeal_date,
    status_basis: raw.status_basis, coverage: raw.coverage, precedence: raw.precedence,
    source_doc_id: doc.doc_id, source_url: doc.source_url || `doc:${doc.doc_id}`, source_origin: doc.origin, retrieved_at: doc.retrieved_at,
    quoted_span, span_start: v.span_start, span_end: v.span_end, verified: v.verified, verification_method: v.method,
    confidence: raw.confidence === null ? null : Math.min(1, Math.max(0, raw.confidence)),
    conflict_flag: raw.conflict_flag, conflict_note: raw.conflict_note, also_supported_by: [], extraction_run_id: run_id
  };
}

// Compile-time proof that the optional second argument keeps the frozen entry point signature.
export const _runCompileMatchesContract: RunCompile = runCompile;

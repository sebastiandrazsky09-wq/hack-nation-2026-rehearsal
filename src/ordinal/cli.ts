// Lead-owned. `npm run ordinal -- <command>`. Routes to module entry points; holds no pipeline logic.
import nextEnv from '@next/env';
// @next/env is CommonJS: under tsx's ESM loading only the default export exists.
nextEnv.loadEnvConfig(process.cwd());
import { DEFAULT_AS_OF } from './contracts';
import { assertIsoDate } from './status';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadAddresses, readRuleStore, readStacks, PATHS } from './corpus';

const [command, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined; }
function has(name: string): boolean { return rest.includes('--' + name); }
function list(name: string): string[] | undefined { return flag(name)?.split(',').map(s => s.trim()).filter(Boolean); }
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

const commands: Record<string, () => Promise<number>> = {
  async compile() {
    const { runCompile } = await import('./compile/index');
    const report = await runCompile({ docs: list('docs'), force: has('force'), offline: has('offline') });
    print(report); return report.docs_failed.length ? 1 : 0;
  },
  async ingest() {
    const file = rest.find(a => !a.startsWith('--') && ![flag('jurisdiction'), flag('case'), flag('title')].includes(a));
    if (!file) throw new Error('Usage: ordinal ingest PATH [--jurisdiction "City, ST"] [--case T6] [--title "..."]');
    const { runCompile } = await import('./compile/index');
    const report = await runCompile({ ingestPath: file, ingestJurisdiction: flag('jurisdiction'), force: has('force') });
    print(report);
    // `--case T6` records a change case for the new document in store/change_cases.json, so `ordinal diff` reports it.
    const caseId = flag('case');
    if (caseId) {
      const { loadIngestedDocs } = await import('./compile/ingest'); const { caseForDocument, upsertCase } = await import('./diff/cases');
      const name = path.basename(file);
      const doc = loadIngestedDocs(PATHS.ingested).find(d => { const stored = path.basename(d.path); return stored.endsWith('_' + name) || stored.endsWith('_' + name + '.txt'); });
      if (!doc) throw new Error(`Ingested document for ${name} not found in ${PATHS.ingested}`);
      const existing = existsSync(PATHS.extraCases) ? JSON.parse(readFileSync(PATHS.extraCases, 'utf8')) : [];
      const added = caseForDocument(readRuleStore(), doc.doc_id, caseId, DEFAULT_AS_OF, flag('title'));
      mkdirSync(path.dirname(PATHS.extraCases), { recursive: true });
      writeFileSync(PATHS.extraCases, JSON.stringify(upsertCase(existing, added), null, 1) + '\n');
      print({ change_case: added });
    }
    return report.docs_failed.length ? 1 : 0;
  },
  async resolve() {
    const { runResolve } = await import('./resolve/index');
    const report = await runResolve({ ids: list('ids'), offline: has('offline') });
    print(report); return 0;
  },
  async apply() {
    const asOf = assertIsoDate(flag('as-of') ?? DEFAULT_AS_OF);
    const { applyAddress } = await import('./apply/index');
    const rules = readRuleStore(); const stacks = readStacks(); const only = list('address');
    const out: Record<string, unknown> = {}; const counts: Record<string, number> = {};
    for (const address of loadAddresses()) {
      if (only && !only.includes(address.address_id)) continue;
      const stack = stacks[address.address_id];
      if (!stack) throw new Error(`No jurisdiction stack for ${address.address_id}; run: ordinal resolve`);
      const results = applyAddress(rules, address, stack, asOf);
      for (const r of results) counts[r.result] = (counts[r.result] ?? 0) + 1;
      if (only) out[address.address_id] = results;
    }
    print(only ? { as_of: asOf, results: out } : { as_of: asOf, rules: rules.length, result_counts: counts }); return 0;
  },
  async export() {
    const { runExport } = await import('./export/index');
    const report = await runExport({ asOf: flag('as-of') ? assertIsoDate(flag('as-of')!) : undefined });
    print(report); return report.schema_errors.length ? 1 : 0;
  },
  async diff() {
    const { runDiff } = await import('./diff/index');
    const report = await runDiff({ asOf: flag('as-of') ? assertIsoDate(flag('as-of')!) : undefined });
    print(report); return report.errors.length ? 1 : 0;
  },
  /** The whole pipeline from the committed store, with no model call and no network: what the demo shows. */
  async demo() {
    const say = (step: string, detail: string) => console.log(`${step.padEnd(9)} ${detail}`);
    const { runCompile } = await import('./compile/index'); const { runResolve } = await import('./resolve/index');
    const { runExport } = await import('./export/index'); const { runDiff } = await import('./diff/index'); const { runSelfcheck } = await import('./selfcheck/index');
    const c = await runCompile({ offline: true });
    say('compile', `${c.docs_processed} documents, ${c.rules_total} rules, ${c.rules_verified} with a quote found in its source, ${c.rules_unverified} withheld; ${c.llm_calls} model calls (replayed from cache)`);
    const r = await runResolve({ offline: true });
    say('resolve', `${r.total} addresses: ${Object.entries(r.by_method).map(([k, v]) => `${v} by ${k.replace('_', ' ')}`).join(', ')}; ${r.unresolved.length} unresolved`);
    const e = await runExport({});
    say('export', `as of ${e.as_of}: ${e.rules} rule records, ${e.lookup_rows} answers for ${e.addresses} addresses, ${e.schema_errors.length} schema errors`);
    const d = await runDiff({});
    for (const [id, s] of Object.entries(d.summary)) say('change', `${id}: ${s.affected} addresses affected, ${s.conflict_flagged} flagged for conflict review (${s.rules.join(', ') || 'no rule matched'})`);
    for (const w of d.warnings) say('warning', w);
    const s = await runSelfcheck();
    mkdirSync(PATHS.out, { recursive: true }); writeFileSync(path.join(PATHS.out, 'selfcheck.json'), JSON.stringify(s, null, 2) + '\n');
    say('selfcheck', s.ok ? 'passed: quotes match sources, schema valid, no pending or failed rule in force, two exports identical' : `FAILED: ${s.failures.join('; ')}`);
    console.log('Not legal advice.');
    return s.ok && !c.docs_failed.length && !e.schema_errors.length && !d.errors.length ? 0 : 1;
  },
  async selfcheck() {
    const { runSelfcheck } = await import('./selfcheck/index');
    const report = await runSelfcheck();
    // Kept beside the submission files so the interface and the README can show the same numbers.
    mkdirSync(PATHS.out, { recursive: true }); writeFileSync(path.join(PATHS.out, 'selfcheck.json'), JSON.stringify(report, null, 2) + '\n');
    print(report); return report.ok ? 0 : 1;
  }
};

// The gate's second compile step lives in src/gate; it is only dispatched from here.
commands.constrain = async () => {
  const { runConstrain } = await import('../gate/compile');
  const report = await runConstrain({ offline: has('offline'), force: has('force'), ruleIds: list('rules') }, { log: line => console.log(line) });
  console.log(JSON.stringify(report, null, 2));
  return report.errors.length ? 1 : 0;
};
const run = commands[command ?? ''];
if (!run) { console.error('Usage: ordinal <compile|ingest|resolve|apply|export|diff|selfcheck|demo|constrain> [options]'); process.exit(2); }
run().then(code => process.exit(code), error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

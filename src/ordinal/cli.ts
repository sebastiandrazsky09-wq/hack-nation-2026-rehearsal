// Lead-owned. `npm run ordinal -- <command>`. Routes to module entry points; holds no pipeline logic.
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { DEFAULT_AS_OF } from './contracts';
import { assertIsoDate } from './status';
import { loadAddresses, readRuleStore, readStacks } from './corpus';

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
    const file = rest.find(a => !a.startsWith('--') && a !== flag('jurisdiction'));
    if (!file) throw new Error('Usage: ordinal ingest PATH [--jurisdiction "City, ST"]');
    const { runCompile } = await import('./compile/index');
    const report = await runCompile({ ingestPath: file, ingestJurisdiction: flag('jurisdiction'), force: has('force') });
    print(report); return report.docs_failed.length ? 1 : 0;
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
  async selfcheck() {
    const { runSelfcheck } = await import('./selfcheck/index');
    const report = await runSelfcheck(); print(report); return report.ok ? 0 : 1;
  }
};

const run = commands[command ?? ''];
if (!run) { console.error('Usage: ordinal <compile|ingest|resolve|apply|export|selfcheck> [options]'); process.exit(2); }
run().then(code => process.exit(code), error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

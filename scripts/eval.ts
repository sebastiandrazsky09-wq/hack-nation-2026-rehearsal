import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildBrief } from '../src/server/ai/brief';
import { validateGrounding } from '../src/contracts/brief';
type Case = { id: string; input: string; requiredUnknowns?: string[]; forbidden?: string[]; split: 'dev' | 'holdout' };
if (process.env.APP_MODE !== 'live') throw new Error('Evals require live mode. Replay is not model-performance evidence.');
const cases = (await readFile('evals/cases.jsonl', 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l) as Case);
const rows: Array<Record<string, unknown>> = [];
for (const item of cases) {
  // Alternate order to reduce drift effects. Same models, schemas, input, token cap, and fallback policy.
  const strategies: Array<'baseline' | 'system'> = rows.length % 4 === 0 ? ['baseline', 'system'] : ['system', 'baseline'];
  for (const strategy of strategies) {
    const started = performance.now();
    try {
      const result = await buildBrief(item.input, strategy);
      validateGrounding(result.brief, item.input);
      const rendered = JSON.stringify({ summary: result.brief.summary, actions: result.brief.actions }).toLowerCase();
      const constraints = !(item.forbidden ?? []).some(s => rendered.includes(s.toLowerCase()));
      const unknowns = (item.requiredUnknowns ?? []).every(s => result.brief.unknowns.some(u => u.toLowerCase().includes(s.toLowerCase())));
      rows.push({ id: item.id, split: item.split, strategy, valid: true, success: constraints && unknowns, constraints, unknowns, ...result });
    } catch (error) { rows.push({ id: item.id, split: item.split, strategy, valid: false, success: false, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : 'failure' }); }
  }
}
await mkdir('evals/results', { recursive: true });
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null;
}
const summary = ['baseline', 'system'].map(strategy => {
  const selected = rows.filter(r => r.strategy === strategy);
  const latencies = selected.map(r => Number(r.latencyMs));
  return { strategy, attempts: selected.length, success: selected.filter(r => r.success).length,
    valid: selected.filter(r => r.valid).length, constraintPass: selected.filter(r => r.constraints).length,
    p50Ms: percentile(latencies, .5), p95Ms: percentile(latencies, .95),
    estimatedCostUsd: selected.reduce((sum, r) => sum + Number(r.estimatedCostUsd ?? 0), 0) };
});
const path = `evals/results/${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(path, JSON.stringify({ warning: 'Toy contract checks, not a domain accuracy benchmark. Inspect failures, lexical grader errors, and model/fallback identities; do not infer statistical significance.', summary, rows }, null, 2));
console.log(JSON.stringify({ path, summary }, null, 2));

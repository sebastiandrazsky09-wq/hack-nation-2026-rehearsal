import type { NextConfig } from 'next';
// The API routes read the committed store and the official pack at request time; a serverless build must ship those files.
const data = ['./store/rules.jsonl', './store/constraints.jsonl', './store/stacks.json', './store/change_cases.json', './store/ingested/**', './official/pack/corpus/**', './official/pack/data/**', './official/pack/dev/**', './supplemental/text/**', './out/selfcheck.json'];
const config: NextConfig = { poweredByHeader: false, experimental: { cpus: 2 }, outputFileTracingIncludes: { '/api/**': data } };
export default config;

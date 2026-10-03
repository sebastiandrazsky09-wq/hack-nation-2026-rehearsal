import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { buildBrief } from '../src/server/ai/brief';
import { sampleInput } from '../src/server/fixtures';
if (process.env.APP_MODE !== 'live') throw new Error('Set APP_MODE=live in .env.local before the live check.');
const result = await buildBrief(sampleInput);
console.log(JSON.stringify({ live: result.mode === 'live', provider: result.model, latencyMs: result.latencyMs, estimatedCostUsd: result.estimatedCostUsd }, null, 2));

import { describe, it, expect, afterEach } from 'vitest';
import { BriefSchema, RequestSchema, validateGrounding } from '../../src/contracts/brief';
import { sampleBrief, sampleInput } from '../../src/server/fixtures';
import { buildBrief } from '../../src/server/ai/brief';
import { appMode } from '../../src/server/config';
import { estimateCost } from '../../src/server/telemetry';
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
describe('contract and reliability boundaries', () => {
  it('accepts grounded evidence but rejects a fabricated quote', () => {
    expect(() => validateGrounding(BriefSchema.parse(sampleBrief), sampleInput)).not.toThrow();
    expect(() => validateGrounding({ ...sampleBrief, evidence: [{ quote: 'Safe to release', interpretation: 'invented' }] }, sampleInput)).toThrow('ungrounded');
  });
  it('rejects empty, oversized, and unexpected request fields', () => {
    expect(RequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(RequestSchema.safeParse({ text: 'a'.repeat(12001) }).success).toBe(false);
    expect(RequestSchema.safeParse({ text: sampleInput, apiKey: 'injection' }).success).toBe(false);
  });
  it('never pretends an arbitrary input was analyzed in replay mode', async () => {
    process.env.APP_MODE = 'replay';
    expect((await buildBrief(sampleInput)).mode).toBe('replay');
    await expect(buildBrief('A completely different report with no matching fixture.')).rejects.toThrow('Replay contains only');
  });
  it('fails explicitly for live mode without provider access', () => {
    process.env.APP_MODE = 'live'; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    expect(appMode).toThrow('server-side provider key');
  });
  it('returns unknown cost for an unpriced model rather than inventing a number', () => {
    expect(estimateCost('unknown', 100, 100)).toBe(null);
    expect(estimateCost('gpt-6.1-sol', 4000, 1000)).toBeCloseTo(0.018);
  });
});

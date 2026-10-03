import { describe, it, expect, vi, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('../../src/server/ai/brief', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/server/ai/brief')>();
  state.build.mockImplementation(actual.buildBrief);
  return { ...actual, buildBrief: state.build };
});
import { POST } from '../../src/app/api/analyze/route';
import { sampleInput } from '../../src/server/fixtures';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; state.build.mockClear(); });

const BAD_INPUT = 'Supply a report between 20 and 12,000 characters.';
const post = (body: string) => POST(new Request('http://localhost/api/analyze', { method: 'POST', body }));
const postJson = (value: unknown) => post(JSON.stringify(value));
const replay = () => { process.env.APP_MODE = 'replay'; };
const validText = 'A sufficiently long report requiring model processing.';

describe('server misconfiguration', () => {
  const cases: Record<string, () => void> = {
    'unknown APP_MODE': () => { process.env.APP_MODE = 'bogus'; },
    'live without provider key': () => {
      process.env.APP_MODE = 'live'; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
      process.env.DEMO_ACCESS_TOKEN = 'local-unit-test-token-not-a-real-secret';
    },
    'live with short DEMO_ACCESS_TOKEN': () => {
      process.env.APP_MODE = 'live'; process.env.OPENAI_API_KEY = 'local-test-placeholder';
      process.env.DEMO_ACCESS_TOKEN = 'too-short';
    }
  };
  for (const [name, setup] of Object.entries(cases)) {
    it(`returns 503 with a generic body: ${name}`, async () => {
      setup();
      const response = await postJson({ text: validText });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Invalid server configuration' });
      expect(state.build).not.toHaveBeenCalled();
    });
  }
});

describe('invalid body', () => {
  const bodies: Record<string, string> = {
    'non-JSON body': 'not json {',
    'JSON null': 'null',
    'JSON array': JSON.stringify([validText]),
    'text shorter than 20': JSON.stringify({ text: 'x'.repeat(19) }),
    'text longer than 12000': JSON.stringify({ text: 'x'.repeat(12001) }),
    'unexpected extra field': JSON.stringify({ text: validText, extra: true })
  };
  for (const [name, body] of Object.entries(bodies)) {
    it(`returns 400 with the frozen message: ${name}`, async () => {
      replay();
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: BAD_INPUT });
      expect(state.build).not.toHaveBeenCalled();
    });
  }
});

describe('replay mode', () => {
  it('returns 503 for a non-sample report', async () => {
    replay();
    const response = await postJson({ text: validText });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/^Replay contains only/);
  });
  it('returns the prepared fixture for the sample, with or without surrounding whitespace', async () => {
    replay();
    for (const text of [sampleInput, `\n  ${sampleInput}  \n`]) {
      const response = await postJson({ text });
      expect(response.status).toBe(200);
      const run = await response.json();
      expect(run.mode).toBe('replay');
      expect(run.model).toBe('prepared-fixture');
    }
  });
});

describe('buildBrief failures', () => {
  it('maps a non-Error throw to a generic 503', async () => {
    replay();
    state.build.mockImplementationOnce(async () => { throw 'boom'; });
    const response = await postJson({ text: validText });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Analysis failed' });
  });
});

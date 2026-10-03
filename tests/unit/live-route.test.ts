import { it, expect, vi, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, build: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock('../../src/server/ai/brief', () => ({ buildBrief: state.build }));
import { POST } from '../../src/app/api/analyze/route';
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; state.cookie = undefined; state.build.mockReset(); });
function configure() {
  process.env.APP_MODE = 'live'; process.env.OPENAI_API_KEY = 'local-test-placeholder';
  process.env.DEMO_ACCESS_TOKEN = 'local-unit-test-token-not-a-real-secret';
}
it('refuses anonymous live inference before any paid provider call', async () => {
  configure();
  const response = await POST(new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify({ text: 'A sufficiently long report requiring model processing.' }) }));
  expect(response.status).toBe(401); expect(state.build).not.toHaveBeenCalled();
});
it('still validates input after a successful private demo unlock', async () => {
  configure(); state.cookie = process.env.DEMO_ACCESS_TOKEN;
  const response = await POST(new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify({ text: 'too short' }) }));
  expect(response.status).toBe(400); expect(state.build).not.toHaveBeenCalled();
});

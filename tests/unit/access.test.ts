import { it, expect, afterEach } from 'vitest';
import { hasDemoAccess } from '../../src/server/access';
const original = process.env.DEMO_ACCESS_TOKEN;
afterEach(() => { if (original === undefined) delete process.env.DEMO_ACCESS_TOKEN; else process.env.DEMO_ACCESS_TOKEN = original; });
it('rejects missing, short, and wrong demo credentials and accepts the exact configured token', () => {
  process.env.DEMO_ACCESS_TOKEN = 'local-unit-test-token-not-a-real-secret';
  expect(hasDemoAccess(undefined)).toBe(false);
  expect(hasDemoAccess('short')).toBe(false);
  expect(hasDemoAccess('wrong-token-with-a-similar-character-length')).toBe(false);
  expect(hasDemoAccess(process.env.DEMO_ACCESS_TOKEN)).toBe(true);
});

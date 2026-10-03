import { timingSafeEqual } from 'node:crypto';
export function hasDemoAccess(value: string | undefined): boolean {
  const expected = process.env.DEMO_ACCESS_TOKEN;
  if (!expected || typeof value !== 'string' || !value) return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

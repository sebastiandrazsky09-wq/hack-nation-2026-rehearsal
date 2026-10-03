export function logTrace(event: Record<string, string | number | boolean | null>) {
  // Only caller-selected metrics. Never log bodies, keys, prompts, or user text.
  console.info(JSON.stringify({ at: new Date().toISOString(), ...event }));
}
export function estimateCost(model: string, input: number, output: number): number | null {
  // Standard short-context list prices checked 2026-10-03; excludes tools/cache/long-context premiums.
  const prices: Record<string, [number, number]> = { 'gpt-6.1-sol': [2, 10], 'claude-sonnet-5-5': [2, 10], 'gpt-6-luna': [0.1, 0.5] };
  const price = prices[model];
  return price ? (input * price[0] + output * price[1]) / 1000000 : null;
}
export function classifyFailure(error: unknown): { category: string; statusCode: number | null } {
  const e = error as { name?: string; statusCode?: number; message?: string } | null;
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : null;
  const category = e?.name === 'AbortError' || e?.name === 'TimeoutError' ? 'timeout'
    : statusCode === 429 ? 'rate_limit' : statusCode === 401 || statusCode === 403 ? 'access'
    : e?.name === 'ZodError' || e?.message === 'Model supplied an ungrounded quote' ? 'validation' : 'provider';
  return { category, statusCode };
}

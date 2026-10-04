import { test, expect } from '@playwright/test';

// What the server sends and refuses. Nothing here depends on the data.
const ROUTES = ['/', '/portfolio', '/record', '/changes', '/system'];
const LEAKS = [/\/Users\//, /node_modules/, /\bat [\w.<>]+ \(/, /\.ts:\d+/, /ZodError/];
const noLeak = (text: string) => { for (const pattern of LEAKS) expect(text).not.toMatch(pattern); };
const validBody = async (request: import('@playwright/test').APIRequestContext) => {
  const { addresses } = await (await request.get('/api/addresses')).json();
  return { subject: { type: 'owner' }, action: { name: 'set_rent_with_pricing_algorithm' }, resource: { type: 'property', id: addresses[0].address_id } };
};

test('every page and API response carries the security headers', async ({ request }) => {
  for (const path of [...ROUTES, '/api/health', '/api/v1/actions']) {
    const headers = (await request.get(path, { maxRedirects: 0 })).headers();
    const csp = headers['content-security-policy'] ?? '';
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) expect(csp, `${path}: ${part}`).toContain(part);
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['permissions-policy'], path).toContain('geolocation=()');
    expect(headers['x-powered-by'], path).toBeUndefined();
  }
});

test('no page violates its own content security policy or logs an error', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', e => problems.push(e.message));
  page.on('response', r => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  for (const path of ROUTES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Not legal advice').first()).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('a malformed, wrong or oversized request gets a plain JSON error with the disclaimer and no internals', async ({ request }) => {
  const good = await validBody(request);
  const cases: { name: string; send: () => Promise<import('@playwright/test').APIResponse>; status: number; code: string }[] = [
    { name: 'not JSON', send: () => request.post('/api/v1/check', { headers: { 'content-type': 'application/json' }, data: Buffer.from('{not json') }), status: 400, code: 'invalid_request' },
    { name: 'wrong shape', send: () => request.post('/api/v1/check', { data: { hello: 'world' } }), status: 400, code: 'invalid_request' },
    { name: 'unknown key', send: () => request.post('/api/v1/check', { data: { ...good, extra: 1 } }), status: 400, code: 'invalid_request' },
    { name: 'prototype key', send: () => request.post('/api/v1/check', { headers: { 'content-type': 'application/json' }, data: Buffer.from(JSON.stringify(good).replace(/}$/, ',"__proto__":{"x":1}}')) }), status: 400, code: 'invalid_request' },
    { name: 'parameter of another action', send: () => request.post('/api/v1/check', { data: { ...good, action: { name: 'set_rent_with_pricing_algorithm', properties: { fee_usd: 10 } } } }), status: 400, code: 'invalid_request' },
    { name: 'impossible date', send: () => request.post('/api/v1/check', { data: { ...good, context: { as_of: '2026-02-31' } } }), status: 400, code: 'invalid_request' },
    { name: 'unknown property', send: () => request.post('/api/v1/check', { data: { ...good, resource: { type: 'property', id: '../../etc/passwd' } } }), status: 404, code: 'property_not_in_registry' },
    { name: 'oversized', send: () => request.post('/api/v1/check', { data: { ...good, resource: { type: 'property', id: 'x'.repeat(20000) } } }), status: 413, code: 'body_too_large' },
    { name: 'batch over the cap', send: () => request.post('/api/v1/checks', { data: { subject: good.subject, action: good.action, resources: Array.from({ length: 501 }, (_, i) => `P${i}`) } }), status: 400, code: 'invalid_request' },
    { name: 'wrong method', send: () => request.get('/api/v1/check'), status: 405, code: 'method_not_allowed' }
  ];
  for (const c of cases) {
    const response = await c.send();
    const text = await response.text();
    expect(response.status(), c.name).toBe(c.status);
    expect(response.headers()['content-type'], c.name).toContain('application/json');
    const body = JSON.parse(text);
    expect(body.error.code, c.name).toBe(c.code);
    expect(body.disclaimer, c.name).toContain('Not legal advice');
    noLeak(text);
  }
});

test('the same request gives the same decision id, and the id changes with the request', async ({ request }) => {
  const good = await validBody(request);
  const ask = async (body: unknown) => (await (await request.post('/api/v1/check', { data: body })).json());
  const a = await ask(good); const b = await ask({ action: good.action, resource: good.resource, subject: good.subject });
  expect(a.decision_id).toMatch(/^dec_[0-9a-f]{16}$/);
  expect(b.decision_id).toBe(a.decision_id);
  const { evaluated_ms: _x, ...restA } = a; const { evaluated_ms: _y, ...restB } = b;
  expect(restB).toEqual(restA);
  const other = await ask({ ...good, context: { as_of: '2025-01-01' } });
  expect(other.decision_id).not.toBe(a.decision_id);
  expect(a.disclaimer).toContain('Not legal advice');
});

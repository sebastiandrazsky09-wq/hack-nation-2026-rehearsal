import { test, expect } from '@playwright/test';
test('the app serves the store and says it is not legal advice', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  const body = await health.json(); expect(body.ok).toBe(true); expect(body.addresses).toBe(500);
  await page.goto('/');
  await expect(page).toHaveURL(/\/record$/);
  await expect(page.getByText('Not legal advice').first()).toBeVisible();
  await expect(page.getByLabel('Address')).toBeVisible();
});
test('lookup rejects a bad date and an unknown address', async ({ request }) => {
  expect((await request.get('/api/lookup?address_id=A0001&as_of=2026-02-31')).status()).toBe(400);
  expect((await request.get('/api/lookup?address_id=NOPE')).status()).toBe(404);
  const ok = await request.get('/api/lookup?address_id=A0002&as_of=2026-10-01');
  expect(ok.status()).toBe(200); const data = await ok.json();
  expect(data.stack.legal_city).toBe('Hoboken, NJ'); expect(data.disclaimer).toContain('Not legal advice');
});

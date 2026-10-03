import { test, expect } from '@playwright/test';
test('hero flow is explicit about replay and renders grounded results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sample replay · no live AI')).toBeVisible();
  await page.getByRole('button', { name: 'Open sample replay' }).click();
  await expect(page.getByRole('heading', { name: 'Two shipments need an evidence check' })).toBeVisible();
  await expect(page.getByText('PREPARED SAMPLE FIXTURE')).toBeVisible();
  await page.screenshot({ path: 'test-results/hero-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/hero-mobile.png', fullPage: true });
});
test('new input produces an honest failure instead of a fake answer', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Paste the report you need to understand').fill('This report is not the known replay sample and needs a real model.');
  await page.getByRole('button', { name: 'Open sample replay' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Replay contains only' })).toBeVisible();
});
test('malformed API request is rejected', async ({ request }) => {
  const response = await request.post('/api/analyze', { data: { text: 'x' } });
  expect(response.status()).toBe(400);
});

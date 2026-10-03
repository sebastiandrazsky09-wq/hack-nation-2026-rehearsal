import { test, expect } from '@playwright/test';
test('failed analysis shows an explicit failure state with one-click sample recovery', async ({ page }) => {
  await page.goto('/');
  const report = page.getByLabel('Paste the report you need to understand');
  const original = await report.inputValue();
  await report.fill('This report is not the known replay sample and needs a real model.');
  await page.getByRole('button', { name: 'Open sample replay' }).click();

  // Next.js injects its own empty role=alert route announcer, so match on the message text.
  const alert = page.getByRole('alert').filter({ hasText: 'Replay contains only' });
  await expect(alert).toHaveCount(1);
  const message = (await alert.textContent())!.trim();
  const panel = page.locator('section.result-panel');
  await expect(panel.getByRole('heading', { name: 'Decision brief' })).toBeVisible();
  await expect(panel.getByTestId('failure-state')).toContainText(message);
  await expect(page.getByRole('heading', { name: 'Your next move starts here.' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/failure-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/failure-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await panel.getByRole('button', { name: 'Restore sample', exact: true }).click();
  await expect(report).toHaveValue(original);
  await expect(alert).toHaveCount(0);
  await expect(panel.getByTestId('failure-state')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your next move starts here.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two shipments need an evidence check' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open sample replay' }).click();
  await expect(page.getByRole('heading', { name: 'Two shipments need an evidence check' })).toBeVisible();
  await expect(panel.getByTestId('failure-state')).toHaveCount(0);
});
test('starting a new analysis clears the failure state', async ({ page }) => {
  await page.goto('/');
  const report = page.getByLabel('Paste the report you need to understand');
  await report.fill('This report is not the known replay sample and needs a real model.');
  const run = page.getByRole('button', { name: 'Open sample replay' });
  await run.click();
  await expect(page.getByTestId('failure-state')).toBeVisible();
  await page.route('**/api/analyze', async route => { await new Promise(r => setTimeout(r, 800)); await route.continue(); });
  await run.click();
  await expect(page.getByTestId('failure-state')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Replay contains only' })).toHaveCount(0);
  await expect(page.getByTestId('failure-state')).toBeVisible();
});

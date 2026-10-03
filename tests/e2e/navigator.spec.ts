import { test, expect, type Page } from '@playwright/test';

const notLegalAdvice = (page: Page) => expect(page.getByText('Not legal advice').first()).toBeVisible();

async function choose(page: Page, query: string, id: string) {
  await page.goto('/');
  await notLegalAdvice(page);
  await page.getByLabel('Address').fill(query);
  await page.getByRole('button', { name: new RegExp(id) }).click();
  await expect(page.getByTestId('stack')).toBeVisible();
}
const notYetEffective = (page: Page) => page.getByTestId('result-badge').filter({ hasText: 'Not yet effective' });

test('typing CLINTON and choosing A0002 shows Hoboken and rule cards', async ({ page }) => {
  await page.goto('/');
  await notLegalAdvice(page);
  await page.getByLabel('Address').fill('CLINTON');
  await page.getByRole('button', { name: /A0002/ }).click();
  await expect(page.getByTestId('stack')).toContainText('Hoboken, NJ');
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
  await notLegalAdvice(page);
});

test('every rule card has a quote, a source link, a retrieval date and the as-of date', async ({ page }) => {
  await choose(page, 'CLINTON', 'A0002');
  const cards = page.getByTestId('rule-card');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  // The evidence for a rule opens in place; open all of it, then check every card.
  await page.getByRole('button', { name: 'Expand all evidence' }).click();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const quote = (await card.locator('blockquote').innerText()).trim();
    expect(quote.length).toBeGreaterThanOrEqual(20);
    await expect(card.locator('a[href]').first()).toBeVisible();
    await expect(card).toContainText(/Retrieved \S+/);
    await expect(card).toContainText('As of 2026-10-01');
  }
  await notLegalAdvice(page);
});

test('the as-of date changes what is not yet effective', async ({ page }) => {
  await choose(page, 'CLINTON', 'A0002');
  await expect(page.getByTestId('results-as-of')).toContainText('2026-10-01');
  const before = await notYetEffective(page).count();
  expect(before).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: '2027-07-02', exact: true }).click();
  await expect(page.getByTestId('results-as-of')).toContainText('2027-07-02');
  const after = await notYetEffective(page).count();
  expect(after).toBeLessThan(before);
  await notLegalAdvice(page);
});

test('a bad date shows a message and no stale cards', async ({ page }) => {
  await choose(page, 'CLINTON', 'A0002');
  await page.getByLabel('As of').fill('');
  await expect(page.getByRole('alert').filter({ hasText: 'real date' })).toBeVisible();
  await expect(page.getByTestId('rule-card')).toHaveCount(0);
  await notLegalAdvice(page);
});

test('a Dorchester mailing address shows legal city Boston', async ({ page, request }) => {
  const { addresses } = await (await request.get('/api/addresses')).json();
  const row = addresses.find((a: { postal_city: string; legal_city: string | null }) => a.postal_city.toLowerCase() === 'dorchester' && a.legal_city?.startsWith('Boston'));
  expect(row).toBeTruthy();
  await choose(page, row.address_id, row.address_id);
  await expect(page.getByTestId('stack')).toContainText('Boston');
  await expect(page.getByText(/Mailing city Dorchester; legal city Boston/)).toBeVisible();
  await notLegalAdvice(page);
});

test('the audit table lists every rule /api/rules returns', async ({ page, request }) => {
  const body = await (await request.get('/api/rules?as_of=2026-10-01')).json();
  await page.goto('/');
  await page.getByRole('tab', { name: 'All extracted rules' }).click();
  await expect(page.getByTestId('audit-summary')).toContainText('withheld');
  await expect(page.getByTestId('audit-row')).toHaveCount(body.rules.length);
  await notLegalAdvice(page);
});

test('mobile has no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page, 'CLINTON', 'A0002');
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/navigator-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: 'All extracted rules' }).click();
  await expect(page.getByTestId('audit-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
  await notLegalAdvice(page);
});

test('desktop screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await choose(page, 'CLINTON', 'A0002');
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/navigator-desktop.png', fullPage: true });
  await notLegalAdvice(page);
});

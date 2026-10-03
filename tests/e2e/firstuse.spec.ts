import { test, expect, type Page } from '@playwright/test';

const notLegalAdvice = (page: Page) => expect(page.getByText('Not legal advice').first()).toBeVisible();

const EXAMPLES: { label: string; check: (page: Page) => Promise<void> }[] = [
  {
    label: 'A 1978 building in Los Angeles: a cutoff year',
    check: async page => {
      await expect(page.getByTestId('stack')).toContainText('Los Angeles');
      await expect(page.locator('dl.facts')).toContainText(/Year built\s*1978/);
    }
  },
  {
    label: 'Mailing city is not the legal city',
    check: async page => { await expect(page.getByText(/Mailing city .+; legal city .+\./)).toBeVisible(); }
  },
  {
    label: 'A city rule and a state rule in tension',
    check: async page => { await expect(page.getByTestId('stack')).toContainText('Hoboken, NJ'); }
  },
  {
    label: 'Pending bills',
    check: async page => { await expect(page.getByTestId('stack')).toContainText('Cambridge, MA'); }
  }
];

test('the empty state offers four examples and each loads a matching address', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Try an example')).toBeVisible();
  for (const { label } of EXAMPLES) await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
  for (const { label, check } of EXAMPLES) {
    await page.goto('/');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByTestId('stack')).toBeVisible();
    await check(page);
  }
});

test('a deep link opens the address and date without a click, and an unknown address falls back', async ({ page }) => {
  await page.goto('/?address=A0002&as_of=2027-07-02');
  await expect(page.getByTestId('stack')).toContainText('Hoboken, NJ');
  await expect(page.getByTestId('results-as-of')).toContainText('2027-07-02');
  await expect(page.getByLabel('As of')).toHaveValue('2027-07-02');
  await expect(page.getByLabel('Address')).toHaveValue(/A0002/);

  await page.goto('/?address=NOPE');
  await expect(page.getByText('Try an example')).toBeVisible();
  await expect(page.getByTestId('stack')).toHaveCount(0);
  await expect(page.locator('.error')).toHaveCount(0);
  await notLegalAdvice(page);
});

test('choosing an address updates the URL and offers Copy link', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Address').fill('CLINTON');
  await page.getByRole('button', { name: /A0002/ }).click();
  await expect(page.getByTestId('stack')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('address')).toBe('A0002');
  await page.getByRole('button', { name: '2027-07-02', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('as_of')).toBe('2027-07-02');
  const copy = page.getByRole('button', { name: 'Copy link' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByRole('status').filter({ hasText: /Link copied|Could not copy/ })).toBeVisible();
});

test('the summary sentence states the same counts as the count buttons', async ({ page }) => {
  await page.goto('/?address=A0002');
  const sentence = page.getByTestId('summary-sentence');
  await expect(sentence).toContainText('On 1 October 2026,');
  const chips = await page.getByTestId('summary').locator('button.chip:not(.chip-clear)').allInnerTexts();
  const chipCounts = chips.map(t => Number(t.match(/^\d+/)?.[0])).filter(n => n > 0);
  expect(chipCounts.length).toBeGreaterThan(0);
  const text = (await sentence.innerText()).replace(/^On \d+ \w+ \d{4},/, '');
  expect((text.match(/\d+/g) ?? []).map(Number)).toEqual(chipCounts);
});

test('a postal-fallback address shows the Low confidence mark', async ({ page, request }) => {
  const { addresses } = await (await request.get('/api/addresses')).json();
  const row = addresses.find((a: { method: string }) => a.method === 'postal_fallback');
  expect(row).toBeTruthy();
  await page.goto(`/?address=${row.address_id}`);
  await expect(page.getByTestId('stack')).toBeVisible();
  await expect(page.getByTestId('low-confidence')).toHaveText('Low confidence');
  await expect(page.locator('.low-confidence-why')).not.toBeEmpty();
});

test('an unknown card with missing facts shows a Needs line without underscores', async ({ page }) => {
  await page.goto('/?address=A0002');
  const card = page.getByTestId('rule-card').filter({ has: page.getByTestId('needs') }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('result-badge')).toHaveText('Unknown');
  const needs = card.getByTestId('needs');
  await expect(needs).toContainText('What would settle it');
  await expect(needs).toContainText('Needs:');
  expect(await needs.innerText()).not.toContain('_');
});

test('Not legal advice is visible in the empty state', async ({ page }) => {
  await page.goto('/');
  await notLegalAdvice(page);
});

test('the empty state has no horizontal scroll at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('Try an example')).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
});

test('desktop screenshot of the empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pending bills', exact: true })).toBeEnabled();
  await notLegalAdvice(page);
  await page.screenshot({ path: 'test-results/firstuse-desktop.png' });
});

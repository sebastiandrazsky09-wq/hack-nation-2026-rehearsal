import { test, expect, type Page } from '@playwright/test';

type Case = { test_id: string; dates: string[]; selected: { selector: string; team_rule_ids: string[] }[]; affected_address_ids: string[] };
type Changes = { cases: Case[]; errors: string[] };

const notLegalAdvice = (page: Page) => expect(page.getByText('Not legal advice').first()).toBeVisible();
const TABS = ['Rules at this address', 'All extracted rules', 'What is changing', 'How it was produced'];

async function openTab(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('tab', { name }).click();
}

test('the What is changing tab lists one block per case with the API affected count', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  expect(body.cases.length).toBeGreaterThan(0);
  await openTab(page, 'What is changing');
  const blocks = page.getByTestId('change-case');
  await expect(blocks).toHaveCount(body.cases.length);
  for (const [i, c] of body.cases.entries()) {
    await expect(blocks.nth(i)).toHaveAttribute('data-test-id', c.test_id);
    await expect(blocks.nth(i).getByTestId('affected-count')).toHaveText(`${c.affected_address_ids.length} addresses affected`);
  }
  await notLegalAdvice(page);
});

test('a case whose selector resolved to no rule shows the gap sentence', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  const gapCase = body.cases.find(c => c.selected.some(s => s.team_rule_ids.length === 0));
  expect(gapCase).toBeTruthy();
  const gapSelectors = gapCase!.selected.filter(s => s.team_rule_ids.length === 0).map(s => s.selector);
  await openTab(page, 'What is changing');
  const block = page.locator(`[data-test-id="${gapCase!.test_id}"]`);
  const gaps = block.getByTestId('selector-gap');
  await expect(gaps).toHaveCount(gapSelectors.length);
  await expect(gaps.first()).toContainText('did not match any rule');
  await expect(gaps.first()).toContainText(gapSelectors[0]);
});

test('choosing an affected address opens the address tab at the case date', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  const c = body.cases.find(x => x.dates.length > 1 && x.affected_address_ids.length > 0) ?? body.cases.find(x => x.affected_address_ids.length > 0)!;
  const id = c.affected_address_ids[0];
  const date = [...c.dates].sort().at(-1)!;
  await openTab(page, 'What is changing');
  const block = page.locator(`[data-test-id="${c.test_id}"]`);
  await block.getByText('Show the affected addresses').click();
  await block.getByRole('button', { name: id, exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Rules at this address' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('As of')).toHaveValue(date);
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(id));
  await expect(page.getByTestId('results-as-of')).toContainText(date);
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
  await notLegalAdvice(page);
});

test('the How it was produced tab lists the steps and the selfcheck verdict', async ({ page, request }) => {
  const body = await (await request.get('/api/pipeline')).json();
  await openTab(page, 'How it was produced');
  await expect(page.getByTestId('pipeline-steps').locator('li')).toHaveCount(body.steps.length);
  for (const s of body.steps) await expect(page.getByTestId('pipeline-steps')).toContainText(s.name);
  await expect(page.getByTestId('pipeline-steps')).not.toContainText('{"');
  if (body.selfcheck) {
    await expect(page.getByTestId('selfcheck-verdict')).toContainText(body.selfcheck.ok ? 'Self-check passed' : 'Self-check failed');
    await expect(page.getByTestId('selfcheck-metrics')).not.toContainText('{"');
    await expect(page.getByTestId('selfcheck-metrics')).not.toContainText('rules_by_jurisdiction');
  } else {
    await expect(page.getByTestId('selfcheck-verdict')).toHaveText('No selfcheck report in this build');
  }
  await notLegalAdvice(page);
});

async function choose(page: Page) {
  await page.goto('/');
  await page.getByLabel('Address').fill('CLINTON');
  await page.getByRole('button', { name: /A0002/ }).click();
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
}

test('pressing the unknown count shows only Unknown cards and Show all restores them', async ({ page }) => {
  await choose(page);
  const cards = page.getByTestId('rule-card');
  const all = await cards.count();
  const unknown = page.getByTestId('summary').getByRole('button', { name: /unknown/ });
  await unknown.click();
  await expect(unknown).toHaveAttribute('aria-pressed', 'true');
  const shown = await cards.count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(all);
  await expect(page.getByTestId('result-badge').filter({ hasNotText: 'Unknown' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(cards).toHaveCount(all);
  await expect(unknown).toHaveAttribute('aria-pressed', 'false');
});

test('a card for an unknown result shows a readable fact name and no underscore', async ({ page }) => {
  await choose(page);
  const card = page.getByTestId('rule-card').filter({ has: page.getByTestId('missing-facts') }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('result-badge')).toHaveText('Unknown');
  const facts = (await card.getByTestId('missing-facts').locator('li').allInnerTexts()).map(t => t.trim());
  expect(facts.length).toBeGreaterThan(0);
  for (const f of facts) expect(f).not.toContain('_');
  expect(await card.getByTestId('missing-facts').innerText()).not.toContain('_');
});

test('Not legal advice is visible on every tab', async ({ page }) => {
  await page.goto('/');
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await notLegalAdvice(page);
  }
});

test('no horizontal page scroll at 390px on each tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page);
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    if (name === 'What is changing') await expect(page.getByTestId('change-case').first()).toBeVisible();
    if (name === 'How it was produced') await expect(page.getByTestId('pipeline-steps')).toBeVisible();
    if (name === 'All extracted rules') await expect(page.getByTestId('audit-row').first()).toBeVisible();
    if (name === 'Rules at this address') await expect(page.getByTestId('rule-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollWidth), name).toBe(390);
  }
});

test('desktop screenshots of the two new tabs', async ({ page }) => {
  await openTab(page, 'What is changing');
  await expect(page.getByTestId('change-case').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/changes-desktop.png' });
  await page.getByRole('tab', { name: 'How it was produced' }).click();
  await expect(page.getByTestId('selfcheck-verdict')).toBeVisible();
  await page.screenshot({ path: 'test-results/pipeline-desktop.png' });
});

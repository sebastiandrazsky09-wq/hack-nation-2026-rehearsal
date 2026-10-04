import { test, expect, type Page } from '@playwright/test';

type Case = { test_id: string; dates: string[]; selected: { selector: string; team_rule_ids: string[] }[]; affected_address_ids: string[] };
type Changes = { cases: Case[]; errors: string[] };

const notLegalAdvice = (page: Page) => expect(page.getByText('Not legal advice').first()).toBeVisible();
const ROUTES = [
  { path: '/record', name: 'Property record' },
  { path: '/changes', name: 'Law changes' },
  { path: '/system', name: 'System' }
];
const navLink = (page: Page, name: string) => page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name, exact: true });

test('the Law changes route lists one block per case with the API affected count', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  expect(body.cases.length).toBeGreaterThan(0);
  await page.goto('/changes');
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
  await page.goto('/changes');
  const block = page.locator(`[data-test-id="${gapCase!.test_id}"]`);
  const gaps = block.getByTestId('selector-gap');
  await expect(gaps).toHaveCount(gapSelectors.length);
  await expect(gaps.first()).toContainText('did not match any rule');
  await expect(gaps.first()).toContainText(gapSelectors[0]);
});

test('a source gap is a neutral note on its case, with the API warning text and no alert', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  const gapCase = body.cases.find(c => body.errors.some(e => e.startsWith(`${c.test_id}:`)));
  expect(gapCase).toBeTruthy();
  await page.goto('/changes');
  const note = page.locator(`[data-test-id="${gapCase!.test_id}"]`).getByTestId('changes-errors');
  await expect(note).toBeVisible();
  await expect(note).not.toHaveAttribute('role', 'alert');
  await expect(note).toHaveClass(/\bgap\b/);
  await expect(note).not.toHaveClass(/\berror\b/);
  for (const e of body.errors.filter(x => x.startsWith(`${gapCase!.test_id}:`))) await expect(note).toContainText(e);
  // Next's own route announcer is an alert outside <main>; the view itself raises none.
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});

test('choosing an affected address opens the record route at the case date', async ({ page, request }) => {
  const body: Changes = await (await request.get('/api/changes')).json();
  const c = body.cases.find(x => x.dates.length > 1 && x.affected_address_ids.length > 0) ?? body.cases.find(x => x.affected_address_ids.length > 0)!;
  const id = c.affected_address_ids[0];
  const date = [...c.dates].sort().at(-1)!;
  await page.goto('/changes');
  const block = page.locator(`[data-test-id="${c.test_id}"]`);
  await block.getByText('Show the affected addresses').click();
  await block.getByRole('button', { name: id, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/record\\?address=${id}&as_of=${date}`));
  await expect(navLink(page, 'Property record')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('As of')).toHaveValue(date);
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(id));
  await expect(page.getByTestId('results-as-of')).toContainText(date);
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
  await notLegalAdvice(page);
});

test('the System route lists the steps and the selfcheck verdict', async ({ page, request }) => {
  const body = await (await request.get('/api/pipeline')).json();
  await page.goto('/system');
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
  await page.goto('/record');
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

test('Not legal advice is visible on every route, and the nav marks the current one', async ({ page }) => {
  await page.goto('/record');
  for (const { path, name } of ROUTES) {
    await navLink(page, name).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(navLink(page, name)).toHaveAttribute('aria-current', 'page');
    for (const other of ROUTES.filter(r => r.name !== name)) await expect(navLink(page, other.name)).not.toHaveAttribute('aria-current', 'page');
    await notLegalAdvice(page);
  }
});

test('no horizontal page scroll at 390px on each route, nav included', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page);
  for (const { path, name } of ROUTES) {
    await page.goto(path === '/record' ? '/record?address=A0002' : path);
    await expect(navLink(page, name)).toBeVisible();
    if (name === 'Law changes') await expect(page.getByTestId('change-case').first()).toBeVisible();
    if (name === 'System') { await expect(page.getByTestId('pipeline-steps')).toBeVisible(); await expect(page.getByTestId('audit-row').first()).toBeVisible(); }
    if (name === 'Property record') await expect(page.getByTestId('rule-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollWidth), name).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBe(390);
  }
});

test('no request for the favicon returns 404', async ({ page, request }) => {
  const missing: string[] = [];
  page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  for (const { path } of ROUTES) { await page.goto(path); await page.waitForLoadState('networkidle'); }
  const href = await page.locator('link[rel~="icon"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  expect((await request.get(href!)).status()).toBe(200);
  expect((await request.get('/icon.svg')).headers()['content-type']).toContain('image/svg+xml');
  expect(missing.filter(u => /icon|favicon/.test(u))).toEqual([]);
});

test('desktop screenshots of the two new routes', async ({ page }) => {
  await page.goto('/changes');
  await expect(page.getByTestId('change-case').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/changes-desktop.png' });
  await navLink(page, 'System').click();
  await expect(page.getByTestId('selfcheck-verdict')).toBeVisible();
  await page.screenshot({ path: 'test-results/pipeline-desktop.png' });
});

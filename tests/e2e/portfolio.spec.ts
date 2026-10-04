import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { ACTIONS, ACTION_NAMES, type ActionName, type CheckBatchResponse, type Decision } from '../../src/gate/contract';
import { shortDate } from '../../src/components/labels';

const ORDER: Decision[] = ['BLOCK', 'REVIEW', 'REQUIRE', 'PASS'];
const AS_OF = '2026-10-01';
const URL_KEY = { amount_months_rent: 'amount', fee_usd: 'fee' } as const;
const exampleOf = (action: ActionName) => ACTIONS[action].parameter?.example;

/** The same request the screen sends, made directly: the expectation for everything the screen shows. */
async function api(request: APIRequestContext, action: ActionName, asOf: string, param = exampleOf(action)): Promise<CheckBatchResponse> {
  const parameter = ACTIONS[action].parameter;
  const response = await request.post('/api/v1/checks', {
    data: {
      subject: { type: 'property_manager' },
      action: { name: action, ...(parameter ? { properties: { [parameter.name]: param } } : {}) },
      context: { as_of: asOf },
      resources: 'all'
    }
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

const screen = (action: ActionName, asOf: string, param = exampleOf(action)) => {
  const parameter = ACTIONS[action].parameter;
  return `/portfolio?action=${action}&as_of=${asOf}${parameter ? `&${URL_KEY[parameter.name]}=${param}` : ''}`;
};
const cells = (page: Page) => page.getByTestId('pf-grid').locator('a.pf-cell');
const rows = (page: Page) => page.getByTestId('pf-table').locator('tbody tr');
const countOf = (page: Page, d: Decision) => page.getByTestId(`pf-count-${d}`).getByTestId('pf-count-n');
const points = (page: Page) => page.getByRole('group', { name: 'Dates when the law changes' });

async function expectCounts(page: Page, expected: CheckBatchResponse) {
  for (const d of ORDER) await expect(countOf(page, d)).toHaveText(String(expected.counts[d]));
}
const differing = (a: CheckBatchResponse, b: CheckBatchResponse) => {
  const was = new Map(a.results.map(r => [r.id, r.decision]));
  return b.results.filter(r => was.get(r.id) !== r.decision).length;
};
const cmp = (a: string, b: string) => a.localeCompare(b, 'en');

test.describe('counts and grid come from the API', () => {
  for (const action of ACTION_NAMES) {
    test(`${action}: four counts equal the API, sum to the cells, and the grid has one cell per property`, async ({ page, request }) => {
      const expected = await api(request, action, AS_OF);
      await page.goto(screen(action, AS_OF));
      await expectCounts(page, expected);
      const sum = ORDER.reduce((n, d) => n + expected.counts[d], 0);
      expect(sum).toBe(expected.evaluated);
      await expect(cells(page)).toHaveCount(expected.evaluated);
      await expect(page.getByTestId('pf-counts').locator('[data-testid^="pf-count-"]:not([data-testid="pf-count-n"])')).toHaveCount(4);
      await expect(page.getByTestId('pf-meta')).toContainText(`${expected.evaluated} properties checked in `);
      await expect(page.getByTestId('pf-meta')).toContainText(`ruleset ${expected.ruleset_version}.`);
      // The shapes carry the decision: every decision in the response has its cells.
      for (const d of ORDER) await expect(page.locator(`a.pf-cell-${d}`)).toHaveCount(expected.counts[d]);
    });
  }

  test('the four counts are in the order BLOCK, REVIEW, REQUIRE, PASS', async ({ page }) => {
    await page.goto('/portfolio');
    const words = page.getByTestId('pf-counts').locator('.pf-word');
    await expect(words).toHaveText(ORDER);
  });

  test('a cell is named with its street, city and decision, and the grid is grouped by legal city', async ({ page, request }) => {
    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    await page.goto('/portfolio');
    await expect(cells(page)).toHaveCount(expected.evaluated);
    const cell = cells(page).first();
    const name = await cell.getAttribute('aria-label');
    expect(name).toMatch(/^.+, .+: (BLOCK|REVIEW|REQUIRE|PASS)$/);
    await expect(cell).toHaveAttribute('title', name!);
    const cities = new Set(expected.results.map(r => r.legal_city ?? 'City not resolved'));
    await expect(page.getByTestId('pf-grid').locator('section.pf-group')).toHaveCount(cities.size);
  });
});

test('pressing a later change point shows how many properties changed, with the API counts', async ({ page, request }) => {
  let pair: { action: ActionName; early: string; late: string; a: CheckBatchResponse; b: CheckBatchResponse } | null = null;
  for (const action of ACTION_NAMES) {
    const base = await api(request, action, AS_OF);
    const dates = [...new Set(base.change_points.map(p => p.date))].sort();
    const byDate = new Map<string, CheckBatchResponse>();
    for (const d of dates) byDate.set(d, await api(request, action, d));
    for (let i = 0; i < dates.length && !pair; i++) {
      for (let j = i + 1; j < dates.length && !pair; j++) {
        const a = byDate.get(dates[i])!, b = byDate.get(dates[j])!;
        if (differing(a, b) > 0) pair = { action, early: dates[i], late: dates[j], a, b };
      }
    }
    if (pair) break;
  }
  expect(pair, 'no two change points with a differing decision in any action').not.toBeNull();
  const { action, early, late, a, b } = pair!;

  await page.goto(screen(action, early));
  await expectCounts(page, a);
  await expect(page.getByTestId('pf-changed')).toHaveCount(0);

  let button = points(page).getByRole('button', { name: new RegExp(`^${shortDate(late)}: `) }).first();
  if (!(await button.count())) {
    await points(page).getByRole('button', { name: /^Show all \d+$/ }).click();
    button = points(page).getByRole('button', { name: new RegExp(`^${shortDate(late)}: `) }).first();
  }
  await button.click();

  await expectCounts(page, b);
  const n = differing(a, b);
  await expect(page.getByTestId('pf-changed')).toHaveText(`${n} ${n === 1 ? 'property' : 'properties'} changed between ${shortDate(early)} and ${shortDate(late)}.`);
  await expect(page.getByTestId('pf-changed')).toHaveAttribute('role', 'status');
  await expect(page.getByLabel('As of')).toHaveValue(late);
  expect(page.url()).toContain(`as_of=${late}`);
});

test('typing a different deposit re-posts, updates the URL, and states what changed', async ({ page, request }) => {
  const action: ActionName = 'collect_security_deposit';
  const a = await api(request, action, AS_OF, 2);
  const b = await api(request, action, AS_OF, 3);
  await page.goto(screen(action, AS_OF, 2));
  await expectCounts(page, a);
  await page.getByLabel(/^Deposit/).fill('3');
  await expectCounts(page, b);
  const n = differing(a, b);
  await expect(page.getByTestId('pf-changed')).toHaveText(`${n === 0 ? 'No property changed' : `${n} ${n === 1 ? 'property' : 'properties'} changed`} between 2 months of rent and 3 months of rent.`);
  expect(page.url()).toContain('amount=3');
});

test('a cell links to the Check screen with its property, the action and the date', async ({ page, request }) => {
  const action: ActionName = 'collect_security_deposit';
  const expected = await api(request, action, AS_OF, 2);
  await page.goto(screen(action, AS_OF, 2));
  await expect(cells(page)).toHaveCount(expected.evaluated);
  const cell = cells(page).first();
  const id = (await cell.getAttribute('data-id'))!;
  expect(expected.results.some(r => r.id === id)).toBe(true);
  const href = new URL((await cell.getAttribute('href'))!, 'http://x');
  expect(href.pathname).toBe('/');
  expect(Object.fromEntries(href.searchParams)).toEqual({ action, property: id, as_of: AS_OF, amount: '2' });

  const asked = page.waitForRequest(r => { const u = new URL(r.url()); return u.pathname === '/' && u.searchParams.get('property') === id && u.searchParams.get('as_of') === AS_OF && u.searchParams.get('action') === action; });
  await cell.click();
  await asked;

  // A table row links the same way.
  await page.goto(screen(action, AS_OF, 2));
  const link = rows(page).first().getByRole('link');
  await expect(link).toHaveAttribute('href', /^\/\?action=collect_security_deposit&property=.+&as_of=2026-10-01&amount=2$/);
});

test.describe('table', () => {
  test('default order is decision, then city, then street; sorting by legal city and filtering by one decision change the rows', async ({ page, request }) => {
    const action: ActionName = 'set_rent_with_pricing_algorithm';
    const expected = await api(request, action, AS_OF);
    await page.goto(screen(action, AS_OF));
    await expectCounts(page, expected);
    await expect(rows(page)).toHaveCount(Math.min(50, expected.evaluated));

    const decisionHeader = page.getByRole('columnheader', { name: 'Decision' });
    await expect(decisionHeader).toHaveAttribute('aria-sort', 'ascending');
    const firstDecision = ORDER.find(d => expected.counts[d] > 0)!;
    await expect(rows(page).first().getByTestId('decision-word')).toHaveText(firstDecision);

    // Sort by legal city.
    await page.getByRole('columnheader', { name: 'Legal city' }).getByRole('button').click();
    await expect(page.getByRole('columnheader', { name: 'Legal city' })).toHaveAttribute('aria-sort', 'ascending');
    const cities = expected.results.map(r => r.legal_city).filter((c): c is string => c !== null).sort(cmp);
    await expect(rows(page).first().locator('td').nth(1)).toHaveText(cities[0]);
    await page.getByRole('columnheader', { name: 'Legal city' }).getByRole('button').click();
    await expect(page.getByRole('columnheader', { name: 'Legal city' })).toHaveAttribute('aria-sort', 'descending');
    await expect(rows(page).first().locator('td').nth(1)).toHaveText(cities[cities.length - 1]);

    // Filter by one decision, the one with the most properties.
    const chosen = [...ORDER].sort((x, y) => expected.counts[y] - expected.counts[x])[0];
    const filter = page.getByTestId(`pf-filter-${chosen}`);
    await expect(filter).toContainText(String(expected.counts[chosen]));
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(Math.min(50, expected.counts[chosen]));
    for (const word of await rows(page).getByTestId('decision-word').allTextContents()) expect(word).toBe(chosen);

    // Unpressing shows everything again.
    await filter.click();
    await expect(rows(page)).toHaveCount(Math.min(50, expected.evaluated));
  });

  test('shows 50 rows and "Show all n" shows every property', async ({ page, request }) => {
    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    await page.goto('/portfolio');
    await expect(rows(page)).toHaveCount(50);
    await page.getByRole('button', { name: `Show all ${expected.evaluated}` }).click();
    await expect(rows(page)).toHaveCount(expected.evaluated);
    await expect(page.getByRole('button', { name: /^Show all/ })).toHaveCount(0);
  });
});

test.describe('keyboard', () => {
  /** Press Tab until `target` has focus; fails if it is not reached within `max` presses. */
  async function tabTo(page: Page, target: Locator, max: number) {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate(el => el === document.activeElement)) return;
    }
    throw new Error(`not reached in ${max} Tab presses`);
  }
  const ringed = async (locator: Locator) => {
    await expect(locator).toHaveCSS('outline-style', 'solid');
    await expect(locator).toHaveCSS('outline-width', '2px');
  };

  test('controls, change points, filter and sort buttons are reachable and operable with the keyboard, with a visible focus ring', async ({ page, request }) => {
    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    await page.goto('/portfolio');
    await expect(cells(page)).toHaveCount(expected.evaluated);

    const action = page.getByLabel('Action');
    await action.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(action).toBeFocused();
    await ringed(action);

    // The date field, then on to the first change point.
    await tabTo(page, page.getByLabel('As of'), 2);
    await ringed(page.getByLabel('As of'));
    const first = points(page).getByRole('button').first();
    await tabTo(page, first, 6);
    await ringed(first);
    const date = (await first.textContent())!;
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(date).toMatch(/: /);

    // A filter button: Space presses it, Enter releases it.
    const block = page.getByTestId('pf-filter-BLOCK');
    await block.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(block).toBeFocused();
    await ringed(block);
    await page.keyboard.press('Space');
    await expect(block).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(block).toHaveAttribute('aria-pressed', 'false');

    // Tab from a filter button reaches the first sort button.
    const propertySort = page.getByRole('columnheader', { name: 'Property' }).getByRole('button');
    await page.getByTestId('pf-filter-PASS').focus();
    await tabTo(page, propertySort, 3);
    await ringed(propertySort);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('columnheader', { name: 'Property' })).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Space');
    await expect(page.getByRole('columnheader', { name: 'Property' })).toHaveAttribute('aria-sort', 'descending');
  });
});

test.describe('states', () => {
  test('an invalid date or deposit shows the issue next to the field and sends nothing', async ({ page, request }) => {
    const action: ActionName = 'collect_security_deposit';
    const expected = await api(request, action, AS_OF, 2);
    await page.goto(screen(action, AS_OF, 2));
    await expectCounts(page, expected);
    let posts = 0;
    page.on('request', r => { if (r.url().endsWith('/api/v1/checks')) posts++; });

    await page.getByLabel(/^Deposit/).fill('0');
    await expect(page.getByText('Deposit must be more than 0 months of rent.')).toBeVisible();
    await expect(page.getByLabel(/^Deposit/)).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel(/^Deposit/).fill('13');
    await expect(page.getByText('Deposit must be at most 12 months of rent.')).toBeVisible();
    await page.getByLabel('As of').fill('');
    await expect(page.getByText(/^Enter the date as year-month-day/)).toBeVisible();
    await page.waitForTimeout(400);
    expect(posts).toBe(0);
    await expectCounts(page, expected); // the last good result stays

    await page.getByLabel(/^Deposit/).fill('2');
    await page.getByLabel('As of').fill(AS_OF);
    await expect(page.getByText(/^Deposit must/)).toHaveCount(0);
  });

  test('a failed request shows an alert and keeps the last good result', async ({ page, request }) => {
    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    await page.goto('/portfolio');
    await expectCounts(page, expected);
    await expect(cells(page)).toHaveCount(expected.evaluated);

    await page.route('**/api/v1/checks', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'The gate failed on this request.' }, disclaimer: 'Not legal advice' }) }));
    await page.getByLabel('As of').fill('2027-03-01');
    // Next's route announcer is also role="alert"; the screen's own line is the one with text.
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert).toHaveText('The gate failed on this request.');
    await expectCounts(page, expected);
    await expect(cells(page)).toHaveCount(expected.evaluated);

    await page.unroute('**/api/v1/checks');
    await page.route('**/api/v1/checks', route => route.abort());
    await page.getByLabel('As of').fill('2027-03-02');
    await expect(alert).toContainText('Could not reach the server');
    await expectCounts(page, expected);

    await page.unroute('**/api/v1/checks');
    const later = await api(request, 'set_rent_with_pricing_algorithm', '2027-03-03');
    await page.getByLabel('As of').fill('2027-03-03');
    await expectCounts(page, later);
    await expect(alert).toHaveCount(0);
  });

  test('a slow answer leaves the previous grid in place, dimmed and aria-busy, then replaces it', async ({ page, request }) => {
    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    await page.goto('/portfolio');
    await expectCounts(page, expected);
    const later = await api(request, 'set_rent_with_pricing_algorithm', '2027-06-01');
    await page.route('**/api/v1/checks', async route => { await new Promise(r => setTimeout(r, 900)); await route.continue(); });
    await page.getByLabel('As of').fill('2027-06-01');
    const body = page.locator('.pf-body');
    await expect(body).toHaveAttribute('aria-busy', 'true');
    await expect(body).toHaveClass(/pf-dim/);
    await expect(cells(page)).toHaveCount(expected.evaluated);
    await expectCounts(page, later);
    await expect(body).toHaveAttribute('aria-busy', 'false');
    await expect(body).not.toHaveClass(/pf-dim/);
  });
});

test.describe('page health', () => {
  test('no console error, no failed request, no horizontal scroll at 390, 768, 1024 and 1440', async ({ page, request }) => {
    const problems: string[] = [];
    page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    // Next cancels its own nav-link prefetches (?_rsc=) when the page navigates away; those are not the screen's requests.
    page.on('requestfailed', r => { if (!r.url().includes('_rsc=')) problems.push(`failed: ${r.url()}`); });
    page.on('response', r => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });

    const expected = await api(request, 'set_rent_with_pricing_algorithm', AS_OF);
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/portfolio');
      await expectCounts(page, expected);
      await expect(cells(page)).toHaveCount(expected.evaluated);
      const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(scroll.scroll, `horizontal scroll at ${width}`).toBeLessThanOrEqual(scroll.client);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('As of').fill('2027-01-01');
    await expect(page.getByTestId('pf-changed')).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    expect(problems).toEqual([]);
  });

  test('the page carries the notice and the nav entry is current', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.getByText('Not legal advice').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Portfolio', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: 'Portfolio' })).toBeVisible();
    await expect(page.getByText('One action checked against every property in the registry on one date.')).toBeVisible();
  });
});

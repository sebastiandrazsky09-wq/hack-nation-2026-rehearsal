import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Expectations come from POST /api/v1/check, never from hand-written decisions.
type Req = { subject: { type: string }; action: { name: string; properties?: Record<string, number> }; resource: { type: 'property'; id: string }; context: { as_of: string; facts?: { units?: number; year_built?: number } } };
type Res = {
  decision: string; decision_id: string; as_of: string; change_points: { date: string; label: string }[];
  review: { code: string; resolvable_by: string[] }[];
};
type Action = { name: string; parameter: null | { name: string; example: number } };
type Row = { address_id: string; units: number | null; year_built: number | null; legal_city: string | null };

const DATE = '2026-10-01';
const WORDS = ['PASS', 'BLOCK', 'REQUIRE', 'REVIEW'];

async function post(request: APIRequestContext, body: Req): Promise<Res> {
  const r = await request.post('/api/v1/check', { data: body });
  expect(r.status()).toBe(200);
  return r.json();
}
async function actions(request: APIRequestContext): Promise<Action[]> {
  return (await (await request.get('/api/v1/actions')).json()).actions.filter((a: { modeled: boolean }) => a.modeled);
}
async function rows(request: APIRequestContext): Promise<Row[]> {
  return (await (await request.get('/api/addresses')).json()).addresses;
}
const bodyFor = (action: Action, id: string, asOf = DATE, facts?: Req['context']['facts']): Req => ({
  subject: { type: 'property_manager' },
  action: { name: action.name, ...(action.parameter ? { properties: { [action.parameter.name]: action.parameter.example } } : {}) },
  resource: { type: 'property', id },
  context: { as_of: asOf, ...(facts ? { facts } : {}) }
});
const urlFor = (action: Action, id: string, asOf = DATE) => {
  const p = new URLSearchParams({ action: action.name, property: id, as_of: asOf });
  if (action.parameter) p.set(action.parameter.name === 'amount_months_rent' ? 'amount' : 'fee', String(action.parameter.example));
  return `/?${p}`;
};
const word = (page: Page) => page.getByTestId('decision-word');

/** Console errors, page errors, failed requests and error statuses seen while the page was in use. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  // Next.js cancels its own route prefetches (`?_rsc=`) for the nav links; those are not requests the screen depends on.
  // The screen itself cancels a check that a newer one has superseded (seen on a real network, where two can overlap): an
  // aborted check is the design, any other failure of it is a problem.
  page.on('requestfailed', r => {
    const superseded = r.url().endsWith('/api/v1/check') && r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!r.url().includes('_rsc=') && !superseded) problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', r => { if (r.status() >= 400) problems.push(`status ${r.status()}: ${r.url()}`); });
  return problems;
}
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('the decision is in the first HTML and equals the API answer for the request on the page', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const shown = html.match(/data-testid="decision-word">(PASS|BLOCK|REQUIRE|REVIEW)</);
  expect(shown).not.toBeNull();
  const panel = html.match(/<pre data-testid="payload-request">([\s\S]*?)<\/pre>/);
  expect(panel).not.toBeNull();
  const sent = JSON.parse(unescape(panel![1]));
  const api = await request.post('/api/v1/check', { data: sent });
  expect(api.status()).toBe(200);
  expect((await api.json()).decision).toBe(shown![1]);
});

test('a bare / shows the Check screen with all four result words known and the disclaimer', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  expect(WORDS).toContain((await word(page).innerText()).trim());
  await expect(page.getByTestId('decision')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByText('Not legal advice').first()).toBeVisible();
  await expect(page.getByTestId('coverage')).toContainText('rules for');
  expect(problems).toEqual([]);
});

test('a missing fact is supplied inline and the answer, the facts row and the URL match the API', async ({ page, request }) => {
  const problems = watch(page);
  const [all, list] = [await rows(request), await actions(request)];
  let found: { action: Action; id: string } | null = null;
  for (const a of all.filter(r => r.units === null).slice(0, 80)) {
    for (const action of list) {
      const res = await post(request, bodyFor(action, a.address_id));
      if (res.review.some(r => r.resolvable_by.includes('units'))) { found = { action, id: a.address_id }; break; }
    }
    if (found) break;
  }
  expect(found, 'a property whose answer waits on the unit count').not.toBeNull();
  const { action, id } = found!;
  await page.goto(urlFor(action, id));
  const review = page.getByTestId('review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Missing:');
  const input = review.locator('input[data-fact="units"]');
  await expect(input).toBeVisible();
  await input.fill('24');
  await input.press('Enter');
  const expected = await post(request, bodyFor(action, id, DATE, { units: 24 }));
  await expect(word(page)).toHaveText(expected.decision);
  await expect(page.locator('tr[data-fact="units"]')).toContainText('supplied by you');
  await expect(page.locator('tr[data-fact="units"]')).toContainText('24');
  await expect.poll(() => new URL(page.url()).searchParams.get('units')).toBe('24');
  await expect(page.getByTestId('decision-id')).toHaveText(expected.decision_id);
  expect(problems).toEqual([]);
});

test('a change point changes the decision and the block says what it was', async ({ page, request }) => {
  const problems = watch(page);
  const [all, list] = [await rows(request), await actions(request)];
  const seen = new Set<string>();
  let found: { action: Action; id: string; date: string; label: string; before: string; after: string } | null = null;
  search: for (const a of all) {
    const place = a.legal_city ?? 'none';
    if (seen.has(place)) continue;
    seen.add(place);
    for (const action of list) {
      const base = await post(request, bodyFor(action, a.address_id));
      for (const p of base.change_points) {
        const at = await post(request, bodyFor(action, a.address_id, p.date));
        if (at.decision !== base.decision) { found = { action, id: a.address_id, date: p.date, label: p.label, before: base.decision, after: at.decision }; break search; }
      }
    }
  }
  expect(found, 'a property and change point where the decision differs').not.toBeNull();
  const f = found!;
  await page.goto(urlFor(f.action, f.id));
  await expect(word(page)).toHaveText(f.before);
  await expect(page.getByTestId('was')).toHaveCount(0);
  const button = page.getByTestId('time').getByRole('button', { name: new RegExp(`${f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  await button.first().click();
  await expect(word(page)).toHaveText(f.after);
  await expect(page.getByTestId('was')).toHaveText(`Was ${f.before}.`);
  await expect(page.getByLabel('As of')).toHaveValue(f.date);
  await expect.poll(() => new URL(page.url()).searchParams.get('as_of')).toBe(f.date);
  expect(problems).toEqual([]);
});

test('the request shown posts to the same decision id the page shows', async ({ page, request }) => {
  const problems = watch(page);
  await page.goto('/');
  await page.getByTestId('payload').locator('summary').click();
  await page.getByRole('tab', { name: 'JSON' }).click();
  const sent = JSON.parse(await page.getByTestId('payload-request').innerText());
  const res = await post(request, sent);
  await expect(page.getByTestId('decision-id')).toHaveText(res.decision_id);
  await page.getByRole('tab', { name: 'curl' }).click();
  await expect(page.getByTestId('payload-curl')).toContainText('/api/v1/check');
  await expect(page.getByTestId('payload')).toContainText('Rental housing is the first policy domain. The request and response shapes are domain-neutral.');
  expect(problems).toEqual([]);
});

test('an invalid parameter shows a field error and keeps the last decision', async ({ page, request }) => {
  const deposit = (await actions(request)).find(a => a.parameter?.name === 'amount_months_rent')!;
  const id = (await rows(request))[0].address_id;
  await page.goto(urlFor(deposit, id));
  const before = (await word(page).innerText()).trim();
  const crashes: string[] = [];
  page.on('pageerror', e => crashes.push(e.message));
  for (const bad of ['0', '13']) {
    await page.locator('#ck-parameter').fill(bad);
    await expect(page.locator('#ck-parameter-err')).not.toBeEmpty();
    await expect(page.getByText('Not updated: the request is invalid.')).toBeVisible();
    await expect(word(page)).toHaveText(before);
  }
  await page.locator('#ck-parameter').fill(String(deposit.parameter!.example));
  await expect(page.getByText('Not updated: the request is invalid.')).toHaveCount(0);
  await expect(page.locator('#ck-parameter-err')).toBeEmpty();
  expect(crashes).toEqual([]);
});

test('choosing a property re-checks and writes it to the URL', async ({ page, request }) => {
  const problems = watch(page);
  const [action] = await actions(request);
  await page.goto(urlFor(action, (await rows(request))[0].address_id));
  await page.getByLabel('Property').fill('CLINTON');
  await page.getByRole('button', { name: /A0002/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('property')).toBe('A0002');
  const expected = await post(request, bodyFor(action, 'A0002'));
  await expect(page.getByTestId('decision-id')).toHaveText(expected.decision_id);
  await expect(word(page)).toHaveText(expected.decision);
  expect(problems).toEqual([]);
});

test('keyboard: tab order through the form, the action changes by key, Enter re-checks, focus is visible', async ({ page, request }) => {
  const problems = watch(page);
  const list = await actions(request);
  const first = list.find(a => !a.parameter)!;
  const deposit = list.find(a => a.parameter?.name === 'amount_months_rent')!;
  const id = (await rows(request))[0].address_id;
  await page.goto(urlFor(first, id));
  await page.locator('#ck-subject').focus();
  const focused = () => page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { id: el.id, text: el.textContent?.trim().slice(0, 30), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 };
  });
  expect((await focused()).outline).toBe(true);
  await page.keyboard.press('Tab');
  expect(await focused()).toMatchObject({ id: 'ck-action', outline: true });
  await page.keyboard.press('Tab');
  expect(await focused()).toMatchObject({ text: 'property record', outline: true });
  await page.keyboard.press('Tab');
  expect(await focused()).toMatchObject({ id: 'ck-property', outline: true });
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');

  // Change the action by key.
  await page.locator('#ck-action').focus();
  await page.keyboard.type(deposit.name === 'collect_security_deposit' ? 'Collect' : 'Charge');
  await expect(page.locator('#ck-action')).toHaveValue(deposit.name);
  await expect(page.locator('#ck-parameter')).toHaveValue(String(deposit.parameter!.example));
  const parameter = page.locator('#ck-parameter');
  await parameter.focus();
  await parameter.fill('3');
  await parameter.press('Enter');
  const body = bodyFor(deposit, id); body.action.properties = { [deposit.parameter!.name]: 3 };
  const expected = await post(request, body);
  await expect(page.getByTestId('decision-id')).toHaveText(expected.decision_id);
  await expect(word(page)).toHaveText(expected.decision);
  await expect.poll(() => new URL(page.url()).searchParams.get(deposit.parameter!.name === 'amount_months_rent' ? 'amount' : 'fee')).toBe('3');
  await parameter.focus();
  expect((await focused()).outline).toBe(true);
  expect(problems).toEqual([]);
});

test('390px: no horizontal scroll, the decision word is in the first screen, the form opens in place', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const box = await word(page).boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await expect(page.locator('#ck-form')).toBeHidden();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#ck-form')).toBeVisible();
  await expect(page.locator('#ck-subject')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(problems).toEqual([]);
});

test('legacy links still land on /record and the other routes', async ({ page }) => {
  await page.goto('/?address=A0002&tab=address');
  await expect(page).toHaveURL(/\/record\?address=A0002(&as_of=\d{4}-\d{2}-\d{2})?$/);
  await page.goto('/?address=A0002&as_of=2027-07-02');
  await expect(page).toHaveURL(/\/record\?address=A0002&as_of=2027-07-02$/);
  await page.goto('/?tab=changes');
  await expect(page).toHaveURL(/\/changes$/);
});

test('an invalid URL falls back to the default decision instead of an error page', async ({ page }) => {
  await page.goto('/?action=nonsense&property=NOPE&as_of=2026-02-31&amount=abc');
  expect(WORDS).toContain((await word(page).innerText()).trim());
  await expect(page.locator('.ck-error')).toHaveCount(0);
  await page.goto('/?action=collect_security_deposit&amount=99');
  expect(WORDS).toContain((await word(page).innerText()).trim());
});

test('desktop and phone screenshots of the Check screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(word(page)).toBeVisible();
  await page.screenshot({ path: 'test-results/check-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(word(page)).toBeVisible();
  await page.screenshot({ path: 'test-results/check-phone.png', fullPage: true });
});

test('no horizontal scroll at 768, 1024, 1100 and 1280 in states with wide tables', async ({ page, request }) => {
  const { addresses } = await (await request.get('/api/addresses')).json() as { addresses: { address_id: string; legal_city: string | null }[] };
  const pick = (city: string) => addresses.find(a => a.legal_city === city)!.address_id;
  const urls = [
    `/?action=set_rent_with_pricing_algorithm&property=${pick('Hoboken, NJ')}&as_of=2026-10-01`,
    `/?action=collect_security_deposit&property=${pick('Boston, MA')}&as_of=2026-10-01&amount=1`,
    `/?action=charge_application_fee&property=${pick('Berkeley, CA')}&as_of=2026-10-01&fee=75`
  ];
  for (const width of [768, 1024, 1100, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of urls) {
      await page.goto(url);
      await expect(page.getByTestId('decision-word')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px ${url}`).toBeLessThanOrEqual(width);
    }
  }
});

import { test, expect, type Page } from '@playwright/test';

// Interactions and accessibility of the time-based layout. Expected values come from the API, not from this file.
type Row = { team_rule_id: string; result: string; conflict_flag: boolean; rule: { title: string; effective_date: string | null } };
const LABELS: Record<string, string> = { applies: 'Applies', unknown: 'Unknown', superseded: 'Superseded', not_yet_effective: 'Not yet effective', pending: 'Pending' };
const VIEWS = ['/record', '/record?address=A0002&as_of=2026-10-01', '/changes', '/system', '/system#rules'];

async function openAddress(page: Page, asOf = '2026-10-01') {
  await page.goto(`/record?address=A0002&as_of=${asOf}`);
  await expect(page.getByTestId('rule-card').first()).toBeVisible();
}
// A rule's card, found by its own title (another card may quote that title in a conflict note).
const cardFor = (page: Page, title: string) => page.getByTestId('rule-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function settled(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.skeleton')).toHaveCount(0);
}

test('evidence stays closed until asked for, and the rule title opens it', async ({ page }) => {
  await openAddress(page);
  const card = page.getByTestId('rule-card').first();
  await expect(card.locator('blockquote')).toHaveCount(0);
  const title = card.getByRole('heading').getByRole('button');
  await expect(title).toHaveAttribute('aria-expanded', 'false');
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(title).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('blockquote')).toBeVisible();
  await expect(card).toContainText('Why this answer');
  await page.keyboard.press('Enter');
  await expect(card.locator('blockquote')).toHaveCount(0);
});

test('the needle moves the date from the keyboard and the answers follow', async ({ page }) => {
  await openAddress(page);
  const needle = page.getByRole('slider', { name: 'Move the as-of date' });
  await expect(needle).toHaveAttribute('aria-valuetext', '1 October 2026');
  await needle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('as_of')).toBe('2026-10-02');
  await expect(page.getByTestId('results-as-of')).toContainText('2026-10-02');
  await expect(page.getByLabel('As of')).toHaveValue('2026-10-02');
});

test('moving the date marks each answer that changed with what it was', async ({ page, request }) => {
  const rows = async (asOf: string) => (await (await request.get(`/api/lookup?address_id=A0002&as_of=${asOf}`)).json()).results as Row[];
  const before = new Map((await rows('2026-10-01')).map(r => [r.team_rule_id, r.result]));
  const after = await rows('2027-07-02');
  const changed = after.filter(r => before.has(r.team_rule_id) && before.get(r.team_rule_id) !== r.result);
  expect(changed.length).toBeGreaterThan(0);
  await openAddress(page);
  await expect(page.getByTestId('change-note')).toHaveCount(0);
  await page.getByRole('button', { name: '2027-07-02', exact: true }).click();
  await expect(page.getByTestId('results-as-of')).toContainText('2027-07-02');
  await expect(page.getByTestId('change-note')).toContainText('between 2026-10-01 and 2027-07-02');
  await expect(page.getByTestId('was')).toHaveCount(changed.length);
  for (const r of changed) {
    const card = cardFor(page, r.rule.title);
    await expect(card.getByTestId('was')).toHaveText(`was ${LABELS[before.get(r.team_rule_id)!].toLowerCase()}`);
    await expect(card.getByTestId('result-badge')).toHaveText(LABELS[r.result]);
  }
});

test('the next rule to take effect is named, and one press goes to that day', async ({ page, request }) => {
  const now = (await (await request.get('/api/lookup?address_id=A0002&as_of=2026-10-01')).json()).results as Row[];
  const next = now.filter(r => r.result === 'not_yet_effective' && r.rule.effective_date).sort((a, b) => (a.rule.effective_date! < b.rule.effective_date! ? -1 : 1))[0];
  expect(next).toBeTruthy();
  await openAddress(page);
  await expect(page.getByTestId('next-change')).toContainText(next.rule.title);
  await page.getByRole('button', { name: 'See that day' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('as_of')).toBe(next.rule.effective_date);
  const then = (await (await request.get(`/api/lookup?address_id=A0002&as_of=${next.rule.effective_date}`)).json()).results as Row[];
  const result = then.find(r => r.team_rule_id === next.team_rule_id)!.result;
  expect(result).not.toBe('not_yet_effective');
  await expect(page.getByTestId('results-as-of')).toContainText(next.rule.effective_date!);
  await expect(cardFor(page, next.rule.title).getByTestId('result-badge')).toHaveText(LABELS[result]);
});

test('every conflict the API flags is shown on its rule', async ({ page, request }) => {
  for (const asOf of ['2026-10-01', '2027-07-02']) {
    const flagged = ((await (await request.get(`/api/lookup?address_id=A0002&as_of=${asOf}`)).json()).results as Row[]).filter(r => r.conflict_flag);
    await openAddress(page, asOf);
    await expect(page.getByTestId('results-as-of')).toContainText(asOf);
    await expect(page.getByText('Conflict flagged for review.')).toHaveCount(flagged.length);
  }
});

test('the address field works from the keyboard alone', async ({ page }) => {
  await page.goto('/record');
  const field = page.getByLabel('Address');
  await field.fill('CLINTON');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stack')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('address')).toMatch(/^A\d+$/);
  await expect(field).toHaveValue(/Clinton St/);
});

test('a search with no match says so', async ({ page }) => {
  await page.goto('/record');
  await page.getByLabel('Address').fill('zzzz no such street');
  await expect(page.getByText(/No address matches/)).toBeVisible();
});

test('a tracked change on the first screen opens the Law changes route', async ({ page, request }) => {
  const { cases } = await (await request.get('/api/changes')).json();
  await page.goto('/record');
  const links = page.getByRole('region', { name: 'Tracked changes' }).getByRole('link');
  await expect(links).toHaveCount(cases.length);
  await links.first().click();
  await expect(page).toHaveURL(/\/changes$/);
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Law changes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('change-case').first()).toBeVisible();
});

test('at 390px each dated rule says when it starts, in words', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAddress(page);
  await expect(page.getByRole('slider')).toBeHidden();
  await expect(page.locator('.rule-timing').filter({ hasText: /Takes effect \d+ \w+ \d{4}/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
});

test('all text meets 4.5:1 contrast on every view', async ({ page }) => {
  for (const url of VIEWS) {
    await settled(page, url);
    if (url.includes('address=')) await page.getByRole('button', { name: 'Expand all evidence' }).click();
    const low = await page.evaluate(() => {
      type C = { r: number; g: number; b: number; a: number };
      const parse = (c: string): C => { const m = (c.match(/[\d.]+/g) ?? []).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
      const over = (top: C, under: C): C => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const lum = (c: C) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ground = (el: Element): C => {
        const layers: C[] = [];
        for (let e: Element | null = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a === 1) break; } }
        return layers.reverse().reduce((bg, layer) => over(layer, bg), { r: 255, g: 255, b: 255, a: 1 });
      };
      const bad = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim();
        const el = node.parentElement;
        if (!text || !el || el.closest(':disabled, script, style') || !el.getClientRects().length) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden') continue;
        const bg = ground(el);
        const a = lum(over(parse(style.color), bg)), b = lum(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) bad.add(`${ratio.toFixed(2)} "${text.slice(0, 40)}"`);
      }
      return [...bad];
    });
    expect(low, `low-contrast text on ${url}`).toEqual([]);
  }
});

test('every control has an accessible name on every view', async ({ page }) => {
  for (const url of VIEWS) {
    await settled(page, url);
    const unnamed = await page.evaluate(() => {
      const text = (ids: string | null) => (ids ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
      return [...document.querySelectorAll('button, a[href], input, select, textarea, summary')]
        .filter(el => !el.closest('[aria-hidden="true"]'))
        .filter(el => {
          const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : '';
          return !(el.getAttribute('aria-label') || text(el.getAttribute('aria-labelledby')) || label || el.textContent || '').trim();
        })
        .map(el => el.outerHTML.slice(0, 90));
    });
    expect(unnamed, `unnamed controls on ${url}`).toEqual([]);
    // Nothing hidden from assistive technology can take keyboard focus.
    expect(await page.locator('[aria-hidden="true"]:not([tabindex="-1"])').evaluateAll(els => els.filter(el => el.matches('button, a[href], input')).length)).toBe(0);
  }
});

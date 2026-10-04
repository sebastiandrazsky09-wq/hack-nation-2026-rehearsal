// Rehearses the five demo steps in a real browser against a running server and checks every word on screen against the API.
// Properties are picked by attribute through the API; no id and no expected decision is written here.
// usage: node scripts/demo-rehearsal.mjs [base-url] [runs]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const runs = Number(process.argv[3] ?? 5);
const LIMIT_MS = 300;
const A = 'set_rent_with_pricing_algorithm', D = 'collect_security_deposit';
const timings = [];
async function api(path, body) {
  const started = performance.now();
  const response = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const json = await response.json();
  if (body) timings.push({ path, ms: performance.now() - started, server_ms: json.evaluated_ms });
  return json;
}
const ask = (action, id, as_of, properties, facts) => api('/api/v1/check', {
  subject: { type: 'property_manager' }, action: { name: action, ...(properties ? { properties } : {}) }, resource: { type: 'property', id },
  context: { as_of, ...(facts ? { facts } : {}) }
});
const fail = message => { throw new Error(message); };
const same = (got, want, what) => { if (got !== want) fail(`${what}: screen says ${got}, API says ${want}`); };

async function rehearse(browser, n) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => problems.push(e.message.slice(0, 160)));
  const word = () => page.getByTestId('decision-word').innerText();
  const settle = async want => { await page.waitForFunction(w => document.querySelector('[data-testid=decision-word]')?.textContent === w, want, { timeout: 8000 }).catch(() => {}); return word(); };
  const { addresses } = await api('/api/addresses');
  const steps = [];

  // 1. A real decision is on screen when the page arrives.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  // The request panel holds the exact request the page sent, whether or not the panel is open.
  const shown = JSON.parse(await page.getByTestId('payload-request').textContent());
  const first = await api('/api/v1/check', shown);
  same(await word(), first.decision, 'step 1 default decision');
  if (!(await page.getByTestId('determining').locator('q').first().innerText().catch(() => '')).length && first.determining.length) fail('step 1: no quoted sentence beside the determining rule');
  steps.push(`1 load: ${first.decision} at ${shown.resource.id} (${first.determining[0]?.title ?? 'no determining rule'})`);

  // 2. Another place, then a date on which the law changes the decision.
  const elsewhere = addresses.find(a => a.legal_city === 'Los Angeles, CA') ?? fail('no Los Angeles property');
  await page.getByLabel('Property', { exact: true }).fill(elsewhere.address_id);
  await page.getByRole('button', { name: new RegExp(elsewhere.address_id) }).click();
  const there = await ask(A, elsewhere.address_id, shown.context.as_of);
  same(await settle(there.decision), there.decision, 'step 2 decision after changing the property');
  let pair = null;
  for (let i = 0; i + 1 < there.change_points.length && !pair; i++) {
    const [a, b] = [there.change_points[i], there.change_points[i + 1]];
    const [da, db] = [await ask(A, elsewhere.address_id, a.date), await ask(A, elsewhere.address_id, b.date)];
    if (da.decision !== db.decision) pair = { a, b, da: da.decision, db: db.decision };
  }
  if (!pair) fail('step 2: no pair of change points with different decisions at this property');
  await page.getByRole('button', { name: pair.a.label, exact: true }).click();
  same(await settle(pair.da), pair.da, `step 2 decision on ${pair.a.date}`);
  await page.getByRole('button', { name: pair.b.label, exact: true }).click();
  same(await settle(pair.db), pair.db, `step 2 decision on ${pair.b.date}`);
  same(await page.getByTestId('was').innerText(), `Was ${pair.da}.`, 'step 2 "was" note');
  steps.push(`2 place and time: ${there.decision} at ${elsewhere.address_id}; ${pair.a.date} ${pair.da} -> ${pair.b.date} ${pair.db}`);

  // 3. A missing fact gives REVIEW; supplying it resolves the decision; changing the amount changes it again.
  const noUnits = addresses.find(a => a.legal_city === 'Jersey City, NJ' && a.units === null) ?? fail('no Jersey City property without a unit count');
  await page.goto(`${base}/?action=${D}&property=${noUnits.address_id}&as_of=2026-10-01&amount=2`, { waitUntil: 'networkidle' });
  const missing = await ask(D, noUnits.address_id, '2026-10-01', { amount_months_rent: 2 });
  same(await word(), missing.decision, 'step 3 decision with the fact missing');
  if (!missing.review.some(r => r.resolvable_by.includes('units'))) fail('step 3: the API does not ask for units here');
  const review = page.getByTestId('review');
  await review.getByRole('spinbutton', { name: 'Number of units' }).fill('24');
  await review.getByRole('button', { name: 'Supply number of units' }).click();
  const supplied = await ask(D, noUnits.address_id, '2026-10-01', { amount_months_rent: 2 }, { units: 24 });
  same(await settle(supplied.decision), supplied.decision, 'step 3 decision with units supplied');
  await page.getByLabel(/Deposit/).fill('1.5');
  const lowered = await ask(D, noUnits.address_id, '2026-10-01', { amount_months_rent: 1.5 }, { units: 24 });
  same(await settle(lowered.decision), lowered.decision, 'step 3 decision at 1.5 months');
  steps.push(`3 fact: ${missing.decision} -> units 24 -> ${supplied.decision} -> 1.5 months -> ${lowered.decision}`);

  // 4. The same action across the registry on the two dates of step 2.
  const batch = as_of => api('/api/v1/checks', { subject: { type: 'property_manager' }, action: { name: A }, context: { as_of }, resources: 'all' });
  const [before, after] = [await batch(pair.a.date), await batch(pair.b.date)];
  const changed = after.results.filter((r, i) => r.decision !== before.results[i].decision).length;
  await page.goto(`${base}/portfolio?action=${A}&as_of=${pair.a.date}`, { waitUntil: 'networkidle' });
  const count = async d => Number(await page.getByTestId(`pf-count-${d}`).getByTestId('pf-count-n').innerText());
  for (const d of ['BLOCK', 'REVIEW', 'REQUIRE', 'PASS']) same(await count(d), before.counts[d], `step 4 ${d} count on ${pair.a.date}`);
  await page.getByRole('button', { name: pair.b.label, exact: true }).click();
  await page.waitForFunction(n => document.querySelector('[data-testid=pf-changed]')?.textContent?.includes(String(n)), changed, { timeout: 8000 }).catch(() => {});
  for (const d of ['BLOCK', 'REVIEW', 'REQUIRE', 'PASS']) same(await count(d), after.counts[d], `step 4 ${d} count on ${pair.b.date}`);
  if (!(await page.getByTestId('pf-changed').innerText()).includes(String(changed))) fail(`step 4: the changed line does not state ${changed}`);
  same(await page.getByTestId('pf-grid').locator('a').count(), after.evaluated, 'step 4 grid cells');
  steps.push(`4 portfolio: ${after.evaluated} properties, ${changed} changed between ${pair.a.date} and ${pair.b.date}; ${JSON.stringify(after.counts)}`);

  // 5. The exact request reproduces the decision id; the system page states its figures.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const id = await page.getByTestId('decision-id').innerText();
  same((await api('/api/v1/check', shown)).decision_id, id, 'step 5 decision id from the shown request');
  await page.goto(base + '/system', { waitUntil: 'networkidle' });
  const system = await api('/api/v1/system');
  if (!(await page.getByTestId('planes').innerText()).includes(`${system.compile.constraints_verified} verified`)) fail('step 5: the system page does not state the verified constraint count');
  steps.push(`5 request and system: ${id}; ${system.compile.constraints_verified} constraints verified, ${system.compile.constraints_withheld} withheld`);

  if (problems.length) fail('console errors: ' + problems.join(' | '));
  await context.close();
  console.log(`run ${n}: ok\n  ` + steps.join('\n  '));
  return steps.join('|');
}

const browser = await chromium.launch();
const outcomes = [];
let failed = false;
for (let n = 1; n <= runs; n++) {
  try { outcomes.push(await rehearse(browser, n)); } catch (e) { failed = true; console.log(`run ${n}: FAILED ${e.message}`); }
}
await browser.close();
const identical = outcomes.length === runs && outcomes.every(o => o.replace(/dec_[0-9a-f]+/g, '') === outcomes[0].replace(/dec_[0-9a-f]+/g, ''));
const slowest = timings.reduce((m, t) => Math.max(m, t.ms), 0);
const slowestServer = timings.reduce((m, t) => Math.max(m, t.server_ms ?? 0), 0);
console.log(`${outcomes.length} of ${runs} runs passed; identical across runs: ${identical}; ${timings.length} gate calls, slowest round trip ${slowest.toFixed(0)} ms, slowest server evaluation ${slowestServer.toFixed(1)} ms (limit ${LIMIT_MS} ms)`);
process.exit(failed || !identical || slowest > LIMIT_MS ? 1 : 0);

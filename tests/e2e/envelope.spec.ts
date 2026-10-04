import { test, expect, type APIRequestContext } from '@playwright/test';

// Expectations come from POST /api/v1/envelope and POST /api/v1/check, never from hand-written values.
const DATE = '2026-10-01';
type Row = { address_id: string; units: number | null; legal_city: string | null };
type Interval = { from: number; to: number; decision: string; permit: boolean; bound_text: string | null };
type Envelope = {
  envelope_id: string; decision: string | null;
  permitted: null | { intervals: Interval[]; reason: string | null };
  decides: { fact: string; regions: unknown[] }[];
  timeline: { from: string | null; to: string | null; decision: string | null; current: boolean }[];
};
const rows = async (request: APIRequestContext): Promise<Row[]> => (await (await request.get('/api/addresses')).json()).addresses;
const body = (action: string, id: string, over: { amount?: number; units?: number } = {}) => ({
  subject: { type: 'property_manager' },
  action: { name: action, ...(over.amount !== undefined ? { properties: { amount_months_rent: over.amount } } : {}) },
  resource: { type: 'property', id },
  context: { as_of: DATE, ...(over.units !== undefined ? { facts: { units: over.units } } : {}) }
});
async function envelope(request: APIRequestContext, data: unknown): Promise<Envelope> {
  const r = await request.post('/api/v1/envelope', { data });
  expect(r.status()).toBe(200);
  return r.json();
}

test('an empty amount shows the envelope alone; supplying the deciding fact gives the permitted range and its quoted bound', async ({ page, request }) => {
  const property = (await rows(request)).find(a => a.legal_city === 'Jersey City, NJ' && a.units === null)!;
  expect(property).toBeDefined();
  const open = await envelope(request, body('collect_security_deposit', property.address_id));
  expect(open.decision).toBeNull();
  expect(open.decides.map(d => d.fact)).toContain('units');

  await page.goto(`/?action=collect_security_deposit&property=${property.address_id}&as_of=${DATE}&amount=2`);
  const section = page.getByTestId('envelope');
  await expect(section).toBeVisible();
  await expect(page.getByTestId('decision')).toBeVisible();

  await page.locator('#ck-parameter').fill('');
  await expect(page.getByTestId('decision')).toHaveCount(0);
  await expect(page.getByText('Not updated: the request is invalid.')).toHaveCount(0);
  await expect(section.locator('[data-row="decides"][data-fact="units"]')).toBeVisible();
  await expect(page.getByTestId('envelope-permitted')).toContainText('Not computable until the number of units is known');

  await section.getByRole('spinbutton', { name: 'Number of units' }).fill('24');
  await section.getByRole('button', { name: 'Supply number of units' }).click();
  const known = await envelope(request, body('collect_security_deposit', property.address_id, { units: 24 }));
  const allowed = known.permitted!.intervals.filter(i => i.permit);
  expect(allowed).toHaveLength(1);
  await expect(section.locator('[data-row="decides"]')).toHaveCount(0);
  await expect(page.getByTestId('envelope-permitted')).toContainText(`Up to ${allowed[0].to} months of rent`);
  await expect(section).toContainText(allowed[0].bound_text!);

  // With an amount the decision returns, and it is the one the envelope gives for that amount.
  const over = Math.min(allowed[0].to + 0.5, 12);
  await page.locator('#ck-parameter').fill(String(over));
  const point = await envelope(request, body('collect_security_deposit', property.address_id, { units: 24, amount: over }));
  const check = await (await request.post('/api/v1/check', { data: body('collect_security_deposit', property.address_id, { units: 24, amount: over }) })).json();
  expect(point.decision).toBe(check.decision);
  await expect(page.getByTestId('decision-word')).toHaveText(check.decision);
  await expect(section).toBeVisible();
});

test('the Until row lists every span of the timeline, and pressing one moves the date and the decision', async ({ page, request }) => {
  const property = (await rows(request)).find(a => a.legal_city === 'Los Angeles, CA')!;
  const env = await envelope(request, body('set_rent_with_pricing_algorithm', property.address_id));
  expect(env.permitted).toBeNull();
  expect(env.timeline.length).toBeGreaterThan(1);
  expect(env.timeline.filter(t => t.current)).toHaveLength(1);

  await page.goto(`/?action=set_rent_with_pricing_algorithm&property=${property.address_id}&as_of=${DATE}`);
  const until = page.getByTestId('envelope').locator('[data-row="until"]');
  await expect(until.locator('li')).toHaveCount(env.timeline.length);
  const first = env.timeline[0];
  await until.getByRole('button').first().click();
  await expect(page.locator('#ck-as-of')).toHaveValue(first.to!);
  await expect(page.getByTestId('decision-word')).toHaveText(first.decision!);
});

test('the request panel carries the envelope call, and the same question gives the same envelope id', async ({ page, request }) => {
  const property = (await rows(request)).find(a => a.legal_city === 'Boston, MA')!;
  const a = await envelope(request, body('collect_security_deposit', property.address_id));
  const b = await envelope(request, body('collect_security_deposit', property.address_id));
  expect(a.envelope_id).toMatch(/^env_[0-9a-f]{16}$/);
  expect(b.envelope_id).toBe(a.envelope_id);
  expect((await request.get('/api/v1/envelope')).status()).toBe(405);
  const bad = await request.post('/api/v1/envelope', { data: { ...body('collect_security_deposit', property.address_id), action: { name: 'collect_security_deposit', properties: { fee_usd: 5 } } } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).disclaimer).toContain('Not legal advice');

  await page.goto(`/?action=collect_security_deposit&property=${property.address_id}&as_of=${DATE}&amount=1`);
  await page.getByRole('tab', { name: 'Envelope' }).click();
  await expect(page.getByTestId('payload-envelope')).toContainText('/api/v1/envelope');
  await expect(page.getByTestId('envelope')).toContainText(a.envelope_id);
});

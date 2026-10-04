import { describe, it, expect } from 'vitest';
import * as check from '../../../src/app/api/v1/check/route';
import * as checks from '../../../src/app/api/v1/checks/route';
import * as actions from '../../../src/app/api/v1/actions/route';
import { ActionsResponseSchema, CheckBatchResponseSchema, CheckResponseSchema, ErrorBodySchema, MAX_BODY_BYTES, UNMODELED_CATEGORIES } from '../../../src/gate/contract';
import { gateData } from '../../../src/server/gate';
import { DISCLAIMER } from '../../../src/server/ordinal';

const post = (handler: (r: Request) => Promise<Response>, body: string) => handler(new Request('http://t/api/v1/x', { method: 'POST', body }));
const algo = { subject: { type: 'owner' }, action: { name: 'set_rent_with_pricing_algorithm' }, resource: { type: 'property', id: gateData().addresses[0].address_id } };

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = ErrorBodySchema.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.disclaimer).toBe(DISCLAIMER);
  return body;
}

describe('POST /api/v1/check', () => {
  it('answers a valid request with a response that passes the contract', async () => {
    const res = await post(check.POST, JSON.stringify(algo));
    expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('no-store');
    const body = CheckResponseSchema.parse(await res.json());
    expect(body.disclaimer).toBe(DISCLAIMER);
  });
  it('400 on invalid JSON', async () => { await expectError(await post(check.POST, '{nope'), 400, 'invalid_request'); });
  it('400 with zod issues, and no stack or path in the body', async () => {
    const res = await post(check.POST, JSON.stringify({ ...algo, action: { name: 'collect_security_deposit' } }));
    const body = await expectError(res, 400, 'invalid_request');
    expect(body.error.issues?.[0].path).toBe('action.properties.amount_months_rent');
    expect(JSON.stringify(body)).not.toMatch(/\.ts|node_modules|\bat \w+ \(/);
  });
  it('400 on an unknown key', async () => { await expectError(await post(check.POST, JSON.stringify({ ...algo, extra: 1 })), 400, 'invalid_request'); });
  it('404 for a property outside the registry', async () => {
    const body = await expectError(await post(check.POST, JSON.stringify({ ...algo, resource: { type: 'property', id: 'NOPE' } })), 404, 'property_not_in_registry');
    expect(body.error.message).toContain('NOPE');
  });
  it('400 when a supplied fact contradicts the record', async () => {
    const a = gateData().addresses.find(x => x.units !== null)!;
    const body = { ...algo, resource: { type: 'property', id: a.address_id }, context: { facts: { units: a.units! + 1 } } };
    await expectError(await post(check.POST, JSON.stringify(body)), 400, 'fact_conflicts_with_record');
  });
  it('413 over the body limit, by bytes and not characters', async () => {
    await expectError(await post(check.POST, 'x'.repeat(MAX_BODY_BYTES + 1)), 413, 'body_too_large');
    await expectError(await post(check.POST, '"' + 'é'.repeat(MAX_BODY_BYTES / 2) + '"'), 413, 'body_too_large');
  });
  it('405 with an Allow header for the other verbs', async () => {
    for (const verb of [check.GET, check.PUT, check.PATCH, check.DELETE]) {
      const res = await verb();
      expect(res.headers.get('allow')).toBe('POST');
      await expectError(res, 405, 'method_not_allowed');
    }
  });
});

describe('POST /api/v1/checks', () => {
  it('answers "all" with a batch response', async () => {
    const res = await post(checks.POST, JSON.stringify({ subject: { type: 'owner' }, action: { name: 'set_rent_with_pricing_algorithm' }, resources: 'all' }));
    expect(res.status).toBe(200);
    const body = CheckBatchResponseSchema.parse(await res.json());
    expect(body.evaluated).toBe(gateData().addresses.length);
  });
  it('400, 404, 413 and 405 carry the disclaimer', async () => {
    const base = { subject: { type: 'owner' }, action: { name: 'set_rent_with_pricing_algorithm' } };
    await expectError(await post(checks.POST, '[]'), 400, 'invalid_request');
    await expectError(await post(checks.POST, JSON.stringify({ ...base, resources: ['NOPE'] })), 404, 'property_not_in_registry');
    await expectError(await post(checks.POST, ' '.repeat(MAX_BODY_BYTES + 1)), 413, 'body_too_large');
    const res = await checks.GET(); expect(res.headers.get('allow')).toBe('POST');
    await expectError(res, 405, 'method_not_allowed');
  });
});

describe('GET /api/v1/actions', () => {
  it('lists the three modeled actions, then the unmodeled categories, then subjects', async () => {
    const res = await actions.GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = ActionsResponseSchema.parse(await res.json());
    expect(body.actions.slice(0, 3).every(a => a.modeled)).toBe(true);
    expect(body.actions.slice(3)).toEqual(UNMODELED_CATEGORIES.map(u => ({ name: u.category, label: u.label, category: u.category, modeled: false, envelope: false, parameter: null })));
    expect(body.subjects.map(s => s.type)).toEqual(['property_manager', 'owner', 'software_agent']);
    expect(body.disclaimer).toBe(DISCLAIMER);
  });
  it('405 with Allow: GET for other verbs', async () => {
    for (const verb of [actions.POST, actions.PUT, actions.PATCH, actions.DELETE]) {
      const res = await verb();
      expect(res.headers.get('allow')).toBe('GET');
      await expectError(res, 405, 'method_not_allowed');
    }
  });
});

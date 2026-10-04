import { redirect } from 'next/navigation';
import { CheckView } from '../components/check/check-view';
import { check } from '../gate';
import { ACTIONS, CheckRequestSchema, SUBJECT_TYPES, type CheckRequest, type CheckResponse } from '../gate/contract';
import { defaultCheckRequest, gateData } from '../server/gate';
export const dynamic = 'force-dynamic';

// `/` is the Check screen. Legacy links (?tab=, ?address=, ?as_of=) still forward to the route that now holds their view.
type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const query = (params: Params, keys: string[]) => {
  const out = new URLSearchParams();
  for (const k of keys) { const v = first(params[k]); if (v) out.set(k, v); }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
};

/** The request the URL describes. Absent parameters come from the default request; an invalid one is not repaired. */
function requestFromUrl(params: Params, fallback: CheckRequest): unknown {
  const name = first(params.action) ?? fallback.action.name;
  const spec = name in ACTIONS ? ACTIONS[name as keyof typeof ACTIONS] : null;
  const number = (key: string) => { const v = first(params[key]); return v === undefined || v === '' ? undefined : Number(v); };
  const urlParameter = spec?.parameter ? number(spec.parameter.name === 'amount_months_rent' ? 'amount' : 'fee') : undefined;
  const units = number('units'); const yearBuilt = number('year_built');
  const subject = first(params.subject) ?? fallback.subject.type;
  return {
    subject: { type: SUBJECT_TYPES.includes(subject as never) ? subject : 'invalid' },
    action: { name, ...(spec?.parameter ? { properties: { [spec.parameter.name]: urlParameter ?? spec.parameter.example } } : {}) },
    resource: { type: 'property', id: first(params.property) ?? fallback.resource.id },
    context: {
      as_of: first(params.as_of) ?? fallback.context?.as_of,
      ...(units !== undefined || yearBuilt !== undefined ? { facts: { ...(units !== undefined ? { units } : {}), ...(yearBuilt !== undefined ? { year_built: yearBuilt } : {}) } } : {})
    }
  };
}

function evaluate(params: Params): { request: CheckRequest; response: CheckResponse } {
  const data = gateData();
  const fallback = defaultCheckRequest();
  const parsed = CheckRequestSchema.safeParse(requestFromUrl(params, fallback));
  if (parsed.success) {
    try { return { request: parsed.data, response: check(parsed.data, data) }; } catch { /* unknown property, fact conflict: show the default */ }
  }
  return { request: fallback, response: check(fallback, data) };
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = first(params.tab);
  if (tab) {
    switch (tab) {
      case 'changes': redirect('/changes');
      case 'pipeline': redirect('/system');
      case 'audit': redirect(`/system${query(params, ['as_of'])}#rules`);
      default: redirect(`/record${query(params, ['address', 'as_of'])}`);
    }
  }
  if (first(params.address)) redirect(`/record${query(params, ['address', 'as_of'])}`);
  const { request, response } = evaluate(params);
  const { addresses } = gateData();
  const record = addresses.find(a => a.address_id === request.resource.id) ?? null;
  return <CheckView initialRequest={request} initialResponse={response} initialProperty={record && { address_id: record.address_id, street_address: record.street_address, postal_city: record.postal_city, state: record.state }} />;
}

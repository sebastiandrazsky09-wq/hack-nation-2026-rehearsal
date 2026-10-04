import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';

// Until the Check screen exists, `/` only forwards legacy links (?tab=, ?address=, ?as_of=) to the route that now holds the view.
type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const query = (params: Params, keys: string[]) => {
  const out = new URLSearchParams();
  for (const k of keys) { const v = first(params[k]); if (v) out.set(k, v); }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
};

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  switch (first(params.tab)) {
    case 'changes': redirect('/changes');
    case 'pipeline': redirect('/system');
    case 'audit': redirect(`/system${query(params, ['as_of'])}#rules`);
    default: redirect(`/record${query(params, ['address', 'as_of'])}`);
  }
}

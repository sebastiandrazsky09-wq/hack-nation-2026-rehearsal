import { ACTIONS, ACTION_NAMES, type ActionName } from '../../gate/contract';
import { DEFAULT_AS_OF, isIsoDate } from '../../components/labels';
import { PortfolioView } from '../../components/portfolio/portfolio-view';
import { URL_KEY } from '../../components/portfolio/portfolio-model';
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The URL is the state: /portfolio?action=&as_of=&amount=&fee=. Anything missing or unrecognised falls back to a default. */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const named = first(params.action);
  const action: ActionName = ACTION_NAMES.find(n => n === named) ?? ACTION_NAMES[0];
  const asOf = first(params.as_of);
  const parameter = ACTIONS[action].parameter;
  const given = parameter ? first(params[URL_KEY[parameter.name]]) : undefined;
  return (
    <PortfolioView initial={{
      action,
      asOf: asOf !== undefined && isIsoDate(asOf) ? asOf : DEFAULT_AS_OF,
      param: parameter ? (given ?? String(parameter.example)) : ''
    }} />
  );
}

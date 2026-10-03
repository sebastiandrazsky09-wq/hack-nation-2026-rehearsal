import { NextResponse } from 'next/server';
import { dataset, parseAsOf, ruleView, DISCLAIMER } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
/** GET /api/rules?as_of=2026-10-01 -> every served rule with its status on that date (the audit view). */
export function GET(request: Request) {
  const asOf = parseAsOf(new URL(request.url).searchParams.get('as_of'));
  if (!asOf) return NextResponse.json({ error: 'as_of must be a real date, YYYY-MM-DD.' }, { status: 400 });
  const { rules, withheld } = dataset();
  return NextResponse.json({ as_of: asOf, disclaimer: DISCLAIMER, withheld_unverified: withheld, rules: rules.map(r => ruleView(r, asOf)) });
}

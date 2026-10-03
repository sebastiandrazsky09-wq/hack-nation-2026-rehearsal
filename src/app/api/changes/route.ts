import { NextResponse } from 'next/server';
import { changes, parseAsOf } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
/** GET /api/changes?as_of=2026-10-01 -> each change case with the rules it selected, the addresses it affects and the addresses flagged for conflict. */
export function GET(request: Request) {
  const asOf = parseAsOf(new URL(request.url).searchParams.get('as_of'));
  if (!asOf) return NextResponse.json({ error: 'as_of must be a real date, YYYY-MM-DD.' }, { status: 400 });
  return NextResponse.json(changes(asOf));
}

import { NextResponse } from 'next/server';
import { lookup, parseAsOf } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
/** GET /api/lookup?address_id=A0001&as_of=2026-10-01 -> rules at this address on that date, with sources. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const asOf = parseAsOf(url.searchParams.get('as_of'));
  if (!asOf) return NextResponse.json({ error: 'as_of must be a real date, YYYY-MM-DD.' }, { status: 400 });
  const result = lookup(url.searchParams.get('address_id') ?? '', asOf);
  if (!result) return NextResponse.json({ error: 'Unknown address_id.' }, { status: 404 });
  return NextResponse.json(result);
}

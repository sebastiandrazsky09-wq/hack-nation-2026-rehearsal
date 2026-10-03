import { NextResponse } from 'next/server';
import { dataset } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
export function GET() {
  try { const d = dataset(); return NextResponse.json({ ok: true, rules: d.rules.length, withheld: d.withheld, addresses: d.addresses.length, version: '0.2.0' }); }
  catch { return NextResponse.json({ ok: false, error: 'Store could not be read' }, { status: 503 }); }
}

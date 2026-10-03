import { NextResponse } from 'next/server';
import { dataset, DISCLAIMER } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
/** Every sample address with its resolved legal city. */
export function GET() {
  const { addresses, stacks } = dataset();
  return NextResponse.json({
    disclaimer: DISCLAIMER,
    addresses: addresses.map(a => ({ ...a, legal_city: stacks[a.address_id]?.legal_city ?? null, method: stacks[a.address_id]?.method ?? 'unresolved', confidence: stacks[a.address_id]?.confidence ?? 0 }))
  });
}

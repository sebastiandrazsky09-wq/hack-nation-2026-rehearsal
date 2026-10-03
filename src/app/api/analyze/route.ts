import { NextResponse } from 'next/server';
import { RequestSchema } from '../../../contracts/brief';
import { buildBrief } from '../../../server/ai/brief';
import { cookies } from 'next/headers';
import { appMode } from '../../../server/config';
import { hasDemoAccess } from '../../../server/access';
export const maxDuration = 30;
export async function POST(request: Request) {
  if (appMode() === 'live' && !hasDemoAccess((await cookies()).get('demo_access')?.value)) {
    return NextResponse.json({ error: 'Enter the private demo access code before running live analysis.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Supply a report between 20 and 12,000 characters.' }, { status: 400 });
  try { return NextResponse.json(await buildBrief(parsed.data.text)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Analysis failed' }, { status: 503 }); }
}

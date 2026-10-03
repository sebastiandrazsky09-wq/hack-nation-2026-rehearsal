import { NextResponse } from 'next/server';
import { hasDemoAccess } from '../../../server/access';
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!hasDemoAccess(body?.token)) return NextResponse.json({ error: 'Invalid demo access code' }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set('demo_access', body.token, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', maxAge: 86400, path: '/' });
  return response;
}

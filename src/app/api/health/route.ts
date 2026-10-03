import { NextResponse } from 'next/server';
import { appMode } from '../../../server/config';
export function GET() {
  try { return NextResponse.json({ ok: true, mode: appMode(), version: '0.1.0' }); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid server configuration' }, { status: 503 }); }
}

import { NextResponse } from 'next/server';
import { pipeline } from '../../../server/ordinal';
export const dynamic = 'force-dynamic';
/** GET /api/pipeline -> the pipeline steps with the numbers from the last selfcheck. */
export function GET() { return NextResponse.json(pipeline()); }

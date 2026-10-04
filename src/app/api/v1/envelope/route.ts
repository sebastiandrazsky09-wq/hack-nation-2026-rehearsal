import { EnvelopeRequestSchema } from '../../../../gate/contract';
import { envelope } from '../../../../gate/envelope';
import { guard, methodNotAllowed, readBody } from '../../../../gate/http';
import { gateData } from '../../../../server/gate';
export const dynamic = 'force-dynamic';

/** POST /api/v1/envelope: what is permitted for one action at one property, what decides it, and until when. */
export const POST = (request: Request) => guard(async () => envelope(await readBody(request, EnvelopeRequestSchema), gateData()));
const notAllowed = () => methodNotAllowed('POST');
export const GET = notAllowed, PUT = notAllowed, PATCH = notAllowed, DELETE = notAllowed;

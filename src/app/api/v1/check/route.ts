import { check } from '../../../../gate';
import { CheckRequestSchema } from '../../../../gate/contract';
import { guard, methodNotAllowed, readBody } from '../../../../gate/http';
import { gateData } from '../../../../server/gate';
export const dynamic = 'force-dynamic';

/** POST /api/v1/check: one decision for one property and one action. */
export const POST = (request: Request) => guard(async () => check(await readBody(request, CheckRequestSchema), gateData()));
const notAllowed = () => methodNotAllowed('POST');
export const GET = notAllowed, PUT = notAllowed, PATCH = notAllowed, DELETE = notAllowed;

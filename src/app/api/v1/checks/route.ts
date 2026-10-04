import { checkBatch } from '../../../../gate';
import { CheckBatchRequestSchema } from '../../../../gate/contract';
import { guard, methodNotAllowed, readBody } from '../../../../gate/http';
import { gateData } from '../../../../server/gate';
export const dynamic = 'force-dynamic';

/** POST /api/v1/checks: the same action over many properties, or `"all"`. */
export const POST = (request: Request) => guard(async () => checkBatch(await readBody(request, CheckBatchRequestSchema), gateData()));
const notAllowed = () => methodNotAllowed('POST');
export const GET = notAllowed, PUT = notAllowed, PATCH = notAllowed, DELETE = notAllowed;

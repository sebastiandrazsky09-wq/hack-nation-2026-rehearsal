// The HTTP edge of the gate: bounded body, zod validation, one error shape. Nothing here reaches the decision.
import type { ZodType } from 'zod';
import { DISCLAIMER } from '../server/ordinal';
import { MAX_BODY_BYTES, type ErrorBody } from './contract';

type ErrorCode = ErrorBody['error']['code'];
export class GateError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string, readonly issues?: { path: string; message: string }[]) { super(message); }
}

const HEADERS = { 'Cache-Control': 'no-store' };
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });

export function errorResponse(error: GateError, extra: Record<string, string> = {}) {
  const body: ErrorBody = { error: { code: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) }, disclaimer: DISCLAIMER };
  return json(body, error.status, extra);
}
export const methodNotAllowed = (allow: string) => errorResponse(new GateError('method_not_allowed', 405, `Use ${allow} on this path.`), { Allow: allow });

/** Reads the body as text, measures bytes, then parses and validates. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new GateError('body_too_large', 413, `The request body must be at most ${MAX_BODY_BYTES} bytes.`);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new GateError('body_too_large', 413, `The request body must be at most ${MAX_BODY_BYTES} bytes.`);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new GateError('invalid_request', 400, 'The body is not valid JSON.', [{ path: '', message: 'Not valid JSON.' }]); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GateError('invalid_request', 400, 'The request does not match the schema.', parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  }
  return parsed.data;
}

/** Runs a handler body; every failure becomes the shared error shape, and anything unexpected a fixed 500. */
export async function guard(run: () => Promise<unknown> | unknown): Promise<Response> {
  try { return json(await run()); }
  catch (error) {
    if (error instanceof GateError) return errorResponse(error);
    return errorResponse(new GateError('internal_error', 500, 'The decision could not be computed.'));
  }
}

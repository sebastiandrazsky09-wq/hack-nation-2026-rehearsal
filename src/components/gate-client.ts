'use client';
// The interface's only way to the engine: the same public endpoints anyone can call.
import type { CheckBatchRequest, CheckBatchResponse, CheckRequest, CheckResponse, EnvelopeRequest, EnvelopeResponse, ErrorBody } from '../gate/contract';

export type GateResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ErrorBody['error'] };

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<GateResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, status: 0, error: { code: 'internal_error', message: 'Could not reach the server. Check your connection and try again.' } };
  }
  const json = await response.json().catch(() => null);
  if (response.ok && json) return { ok: true, data: json as T };
  return { ok: false, status: response.status, error: (json as ErrorBody | null)?.error ?? { code: 'internal_error', message: `The request failed (status ${response.status}).` } };
}

export const postCheck = (request: CheckRequest, signal?: AbortSignal) => post<CheckResponse>('/api/v1/check', request, signal);
export const postEnvelope = (request: EnvelopeRequest, signal?: AbortSignal) => post<EnvelopeResponse>('/api/v1/envelope', request, signal);
export const postChecks = (request: CheckBatchRequest, signal?: AbortSignal) => post<CheckBatchResponse>('/api/v1/checks', request, signal);
/** The curl that reproduces a request against this server. */
export const curlFor = (origin: string, path: string, body: unknown) => `curl -s -X POST ${origin}${path} \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(body)}'`;
/** A link is only rendered for http and https; anything else is shown as text. A source header is untrusted input. */
export const safeHref = (url: string | null | undefined): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

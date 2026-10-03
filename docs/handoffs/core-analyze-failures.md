# core-analyze-failures

Implementation commit: SHA not captured. I ran `git commit -q` (the quiet flag hid the SHA). The permitted command list excludes `git log` and `git rev-parse`, and reading the worktree's gitdir was denied. The commit is the one titled "Return 503 JSON for invalid server configuration in analyze route" on `task/core-analyze-failures`, directly on base f00abf8. This handoff is committed separately afterwards.

## Reproduction (before the fix)
`npm test -- tests/unit/analyze-route.test.ts` against the unmodified `route.ts`: 12 tests, 3 failed, 9 passed. The 3 failures were the misconfiguration cases. `appMode()` threw out of `POST` (route.ts:9) instead of returning a response:
- `APP_MODE=bogus`: `Error: APP_MODE must be live or replay`
- live, no provider key: `Error: Live mode requires a server-side provider key`
- live, `DEMO_ACCESS_TOKEN` too short: `Error: Live mode requires a random DEMO_ACCESS_TOKEN of at least 24 characters`

## Behavior
- Before: those three configurations made `POST` reject with an unhandled exception. The client got no JSON `{error}`.
- After: `appMode()` is wrapped. On a throw, `POST` returns 503 with exactly `{error:"Invalid server configuration"}`, the same wording as /api/health. `buildBrief` is not called and the body has no config detail.
- Everything else is unchanged: 401 in live mode without access (still before body parsing), the 400 message, replay 503 "Replay contains only...", 200 Run, and `buildBrief` errors passing through with 503.

## Changed interfaces
One new response for a previously unhandled case: 503 `{error:"Invalid server configuration"}`. Nothing else.

## Tests
`tests/unit/analyze-route.test.ts` (new, 12 tests) covers the matrix:
- (a) 3 misconfiguration cases.
- (b) 6 invalid bodies: non-JSON, null, array, text under 20, text over 12000, extra field.
- (c) replay with a non-sample report.
- (d) replay with the sample, with and without surrounding whitespace, through the real `buildBrief`.
- (e) a non-Error throw from `buildBrief`.

It restores `process.env` after each case, and makes no network or provider calls. In the misconfiguration cases the "live with short token" case sets a placeholder `OPENAI_API_KEY`, which is never used.

## Commands run (real output)
1. `npm test -- tests/unit/analyze-route.test.ts` before the fix: 3 failed, 9 passed (12).
2. Same command after the fix: 1 file, 12 passed.
3. `npm run check`: typecheck clean; vitest 4 files, 20 tests passed (8 existing, unmodified, plus 12 new); secret guard passed.

`npm run build` and `npm run test:e2e` were NOT run, as instructed. No dev server or Playwright session was started, so nothing to close.

## Remaining risks
- The 401 branch is not covered by the new file (the `cookies` mock returns no cookie, and live-route.test.ts owns that path).
- A non-Error thrown by `hasDemoAccess` or `cookies()` is still outside the try/catch. Only `appMode()` was in scope.
- `buildBrief` error messages still pass through verbatim, per the non-goals.
- Implementation SHA is not recorded here (see top).

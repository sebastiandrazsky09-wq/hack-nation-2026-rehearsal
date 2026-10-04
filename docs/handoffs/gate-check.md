# gate-check handoff

Check screen at `/` per `docs/gate/SPEC-check.md`. Implementation commit: see the SHA at the bottom.

## Behavior
- `src/app/page.tsx`: legacy `?tab=` and `?address=` redirects kept. Otherwise the URL (`action`, `property`, `as_of`, `subject`, `amount`, `fee`, `units`, `year_built`) is validated with `CheckRequestSchema` and evaluated with `check(request, gateData())` on the server. Any invalid value, unknown property or thrown error falls back to `defaultCheckRequest()`. The decision is in the first HTML.
- `src/components/check/`: `check-view.tsx` (form, state, re-check with 150 ms debounce for typed fields, AbortController, URL write-back with `replaceState`), `sections.tsx` (the nine result sections in spec order), `supply.tsx` (inline fact input).
- `src/components/record/address-search.tsx`: the address search extracted from `record-view.tsx` and used by both screens. `optionText` in `address.ts` now accepts a `Pick` of `AddressRow`.
- All CSS in `src/app/check.css` (`ck-` classes). At 960px and below the form sits behind an Edit button and tables become stacked rows.
- Errors: 400 with issues shows the field error and "Not updated: the request is invalid." with the last decision kept; 404, network and 5xx show a `role="alert"` line and dim the last decision.

## Checks actually run
- `npm run check`: typecheck clean, 239 unit tests passed, secret guard passed.
- `npm run build`: passed.
- `npm run test:e2e`: 55 passed, 0 failed (12 of them in the new `tests/e2e/check.spec.ts`).
- Existing `smoke.spec.ts` and `firstuse.spec.ts` assertions that a bare `/` redirects to `/record` now assert the Check screen.

## Screenshots seen (`test-results/check-desktop.png` 1440x900, `check-phone.png` 390x844)
Desktop: two columns, BLOCK block with red left border, determining table, time axis, trace, evidence, coverage. Phone: recap with Edit, decision word inside the first 844px, stacked table rows.
Fixed after looking:
- Change-point buttons printed the date twice, because the API label already begins with it. Now the date is prepended only when missing.
- On the phone the change-point buttons had a fixed height and overlapped the Trace heading. They now grow with their text.

## Risks and notes
- The e2e watcher ignores cancelled `?_rsc=` requests: Next.js route prefetches for the nav links are aborted on load. Any other failed request or console error fails the test. The invalid-parameter test does not use the watcher because the expected 400 logs a console error.
- The nav in the shell clips "Law changes" at 390px ("Law char"). It is in `shell.tsx`, outside my paths; not changed.
- The property input is not disabled while `/api/addresses` loads, so typing early shows "No address matches" until the list arrives.
- Change-point label text comes from the API as-is; two labels in the sample data embed the date themselves.
- Not tested: the 404/5xx/network banner (no mock for it in e2e), and the 150 ms dim delay.

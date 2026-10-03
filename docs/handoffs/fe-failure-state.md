# fe-failure-state

Implementation commit: `784ac430cde00b316bf8436efa19399420d519c8` (base 5d7b6ad). This handoff is committed separately afterwards.

## Behavior
- Before: a failed analysis showed the error only in the left panel. The "Decision brief" panel kept the neutral "Your next move starts here." empty state.
- After: when `error` is set and there is no run, the panel shows a failure card. It has a warning icon, the heading "Analysis could not finish.", the server message, a note that no brief was produced, and a "Restore sample" button.
- "Restore sample" sets the textarea to the sample, clears the error and run, and returns to the empty state. It does not auto-run analysis.
- Starting an analysis already clears `error` (`setError('')` in `analyze()`), so the failure card disappears during the request.
- The message is rendered as plain text in the card. The existing left-panel `<p role="alert">` is the only role=alert element I added or kept, so hero.spec.ts's strict locator is unaffected.

## Changed interfaces
None. Props, fetch contract and existing copy and accessible names are unchanged.

## Files
`src/components/workspace.tsx` (one conditional branch plus the `AlertTriangle` import from the already-installed lucide-react), `src/app/globals.css` (rules appended after line 5; the file is not a single line, contrary to the envelope), `tests/e2e/failure-state.spec.ts` (new, 2 tests).

## Commands run (real output)
1. `npm run check`: typecheck clean; vitest 3 files, 8 tests passed; secret guard passed.
2. `npm run build`: succeeded (Next webpack build, all routes listed).
3. `npm run test:e2e` (last Playwright run): 5 passed (failure-state x2, hero x3).

The first e2e run failed 2 of my own new tests. Next.js injects an empty role=alert route announcer, so my `getByRole('alert')` count assertions were wrong. I fixed it by filtering on the message text. This was one fix, in the test only. check, build and e2e were re-run afterwards.

## Screenshots (gitignored, not committed)
- /Users/sebastiandrazsky/Developer/work-fe-failure-state/test-results/failure-desktop.png
- /Users/sebastiandrazsky/Developer/work-fe-failure-state/test-results/failure-mobile.png

I viewed the desktop screenshot. I did not view the mobile one; the 390px check is the `scrollWidth === 390` assertion.

## Acceptance not independently verified
None skipped. No manual dev server or playwright-cli session was started, so there was nothing to close.

## Remaining risks
- The failure card appears for any `error`, including the live-mode "Invalid demo access code" error and client timeouts. The copy "Analysis could not finish." covers these, but the live-mode UI was not tested.
- The message appears twice on screen: the left alert and the right card. This is intentional, so there is a single role=alert.
- Editing the input after a failure leaves the failure card up (stale-result handling is a stated non-goal).

# Handoff: ui-changes

## What each new tab shows
1. "What is changing": one block per case from /api/changes in test_id order, with title, dates, "What the test expects", rules selected, a results-by-date table, "N addresses affected" and "N addresses flagged for conflict review" each with a legal-city breakdown, and the notes.
2. A selector that resolved to no rule shows a highlighted "Gap." sentence naming the selector. Any `errors[]` from the API appear in a red box at the top of the tab.
3. Affected ids sit in a collapsed "Show the affected addresses" list; choosing one opens "Rules at this address" for that address with the case date (later date of the case) in the As of control.
4. "How it was produced": numbered pipeline steps, the selfcheck verdict (passed, or failed with the failures listed; "No selfcheck report in this build" when null), and a two-column metrics table with readable labels. JSON-string metrics are parsed into short lists (the empty-cells list is collapsed). JSON that the server embeds in step details is shown as "name n, name n" by the client.
5. Rule cards: caveats, coverage conditions, exemptions and the effective date moved into a closed "More detail" element. Missing facts use readable names. The summary counts are buttons (aria-pressed) that filter cards by result; "Show all" clears. Filtering is display only.
6. "Not legal advice" is in the page header, so it shows on all four tabs.

## Commands run (in this order, after the last code change)
- `npm run check`: typecheck clean, 115/115 unit tests, secret guard passed.
- `npm run build`: compiled successfully.
- `npm run test:e2e`: 19 passed (9 new in changes.spec.ts, 8 in navigator.spec.ts, 2 in smoke.spec.ts). The 10 existing tests were not modified.
- `rg` over src/components/ for T1..T6 and rule-id patterns: only match is the text "YYYY-MM-DD" in audit-table.tsx (not an id).
- An earlier run of the same three commands also passed before two display fixes (case type text removed; raw JSON in step details made readable).

## Screenshots (gitignored, default viewport, not fullPage)
- test-results/changes-desktop.png: checked the four tabs and the notice are visible, the errors box shows the unresolved selector from the API, the first case shows its title, dates, expected behaviour and selected rule. The screenshot ends after the first case's rules, so counts and breakdowns are verified by the e2e assertions, not by this image.
- test-results/pipeline-desktop.png: checked that the six steps are numbered and the Apply and Resolve steps no longer show raw JSON. The selfcheck verdict and metrics table are below the fold, so they are covered by e2e assertions only and I did not view them.

## API fields wanted and missing
None. Note: `type` on a case is a raw value ("as_of"), so I do not display it. Pipeline step `detail` strings embed JSON; handled in the client.

## Risks
- The "What the test expects" text is the official description as returned (it contains names like `not_yet_effective`); I did not rewrite it.
- The selfcheck verdict and metrics table were not viewed in a screenshot.
- Each case renders one button per affected address (up to 250) inside a closed details element; fine in tests, not profiled.
- The unknown-card test relies on address A0002 having at least one unknown result with missing facts at the default date.
- Date input shows the browser locale format; not changed.

## Commit
Implementation SHA: from `git rev-parse HEAD` on branch task/ui-changes, reported in the lead message (the handoff is committed with the implementation).

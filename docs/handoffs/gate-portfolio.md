# gate-portfolio handoff

Implements `docs/gate/SPEC-portfolio.md`: the Portfolio screen at `/portfolio`, from `POST /api/v1/checks`.

## Behavior
- URL is the state (`/portfolio?action=&as_of=&amount=&fee=`), read on the server in `page.tsx`, kept current with `history.replaceState`. Defaults: first action, 2026-10-01, the action's `example`.
- Controls, change-point buttons (eight nearest the date plus "Show all n"), four counts in BLOCK/REVIEW/REQUIRE/PASS order, the meta line, the changed-since line (`role="status"`), the 500-cell grid grouped by legal city, and the sortable, filterable table (50 rows, "Show all n").
- Each change re-posts after 150 ms; the superseded request is aborted. The previous result stays while loading, dimmed after 150 ms, `aria-busy`. Invalid date or parameter shows the issue beside the field and sends nothing. An error shows a `role="alert"` line and keeps the last good result.
- Changed line and 2px outline (900 ms, none under reduced motion) apply only when the action is unchanged and the date or parameter differs from the previous response.
- All new CSS is in `src/app/portfolio.css`, `pf-` names, existing tokens only.

## Choices to know about
- The API's change-point labels already begin with the short date ("14 Oct 2024: ..."). The button strips that prefix so the date is not written twice.
- Cell and row links go to `/?action=&property=&as_of=&amount=|fee=`. At this commit `/` is still the redirect to `/record`, which drops `property` and `action`. The test asserts the link href and that the browser requests that URL, not the landing page.
- "1 property changed" is singular for one; the spec's template is plural.
- A null legal city is grouped last as "City not resolved".
- REQUIRE cell bar is 8x4px; the spec's "4px" did not say which dimension.

## Commands run
- `npm run typecheck`: passed.
- `npm run check`: passed (239 unit tests, 18 files; secret and submission checks passed).
- `npm run build`: passed.
- `npm run test:e2e`: 59 passed, 0 failed (16 of them in `portfolio.spec.ts`).

## Screenshots (playwright-cli, dev server on 62631, session closed, server stopped)
`docs/handoffs/gate-portfolio-1440.png`, `-390.png`, `-390-grid.png` (left untracked; not in the allowed paths).
Seen at 1440: header, controls, change points, counts, grid and table read correctly; shapes distinguish all four decisions. At 390: controls stack, change points stack, counts stay in one row, grid wraps, no sideways scroll.
Fixed after looking: doubled dates on change-point buttons; the action select truncated its label at 460px (max-width now 600px).

## Not covered / risks
- The 900 ms changed-cell outline has no automated test (timing would be flaky); the changed line that is set with it is tested.
- Focus is lost when "Show all n" unmounts after pressing.
- The action select still truncates its long label on a 390px screen (native select).
- Date typing in the date field is not exercised by the keyboard test; segments are browser specific.

## Commit
See `git rev-parse HEAD` on `task/gate-portfolio` (recorded in the report).

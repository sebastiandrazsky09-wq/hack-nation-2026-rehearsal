# The Portfolio screen at `/portfolio` (BUILD-1 lane, frontend role)

One action across the 500 registry properties on one date, from `POST /api/v1/checks`. Read first: `src/gate/contract.ts` (`CheckBatchRequest`, `CheckBatchResponse`, `ACTIONS`), `docs/DESIGN.md` and `src/app/globals.css` (keep the design system), `src/components/decision-mark.tsx`, `src/components/gate-client.ts` (`postChecks`), `src/components/timeline.tsx`.

## Allowed files
`src/components/portfolio/**` (replace the stub `portfolio-view.tsx`), `src/app/portfolio/page.tsx`, `src/app/portfolio.css` (all new CSS here, class names starting `pf-`), `tests/e2e/portfolio.spec.ts`. Do not edit `globals.css`, `layout.tsx`, `shell.tsx`, `decision-mark.tsx`, `gate-client.ts`, `src/app/page.tsx`, `src/components/check`, `src/components/record`, anything under `src/gate`, `src/server`, `src/ordinal`, `src/app/api`.

## Content, top to bottom
1. Controls in one row (wraps on small screens): Action `<select>` (the three `ACTIONS`), the action's parameter input when it has one (default: the action's `example`), As of date input. State lives in the URL: `/portfolio?action=&as_of=&amount=&fee=`. Each change re-posts (debounce typed input 150 ms, abort the superseded request).
2. Change points: one button per `response.change_points` entry, labelled "{short date}: {label}", in date order; pressing one sets the date. If there are more than eight, show the eight nearest to the current date and a "Show all {n}" disclosure.
3. Counts (`data-testid="pf-counts"`): four figures in one row, each with its `DecisionMark` and word: BLOCK, REVIEW, REQUIRE, PASS, in that order, 20px/700 tabular figures, the word at 13px. Then one 13px muted line: "{evaluated} properties checked in {evaluated_ms rounded to one decimal} ms, ruleset {ruleset_version}." Every figure comes from the response; they sum to `evaluated`.
4. When the date or the action's parameter changes and a previous response exists: a line (`data-testid="pf-changed"`, `role="status"`) "{n} properties changed between {a} and {b}." (or "No property changed between {a} and {b}."), computed by comparing the two responses' `results` by `id`.
5. Grid (`data-testid="pf-grid"`): the 500 properties as cells grouped by legal city (group heading: city name and its four counts in words, 13px). A cell is a 12px square link (`<a>`) with 2px gaps: BLOCK filled `var(--block)`; REVIEW filled `var(--review-bg)` with a 1px `var(--review)` border and a diagonal corner cut or small triangle so it differs in shape; REQUIRE filled `var(--require)` with a centred 4px white bar; PASS white with a 1px `var(--pass)` ring (rounded). Each cell's accessible name and `title`: "{street}, {city}: {decision}". Cells whose decision changed since the previous response get a 2px navy outline for 900 ms once (not with `prefers-reduced-motion`). A cell links to `/` with that request (`/?action=…&property=<id>&as_of=…&amount=…`).
6. Table (`data-testid="pf-table"`): Property (street), Legal city, Decision (`DecisionWord`), Top reason. Sortable by clicking a column heading (real `<button>` in the `<th>`, `aria-sort` on the `<th>`); default sort: decision in the order BLOCK, REVIEW, REQUIRE, PASS, then city, then street. A filter row above it: four toggle buttons (one per decision, with count) that limit the table; none pressed shows all. Show 50 rows with a "Show all {n}" button. Each row's property is a link to `/` with that request. The table scrolls inside its own frame on small screens.

## States
Loading: the previous grid and table stay, dimmed after 150 ms, `aria-busy`. First load with no data: neutral placeholder rows at the grid's height (no spinner). Error (`400` issues, network, `5xx`): a `role="alert"` line with the message; the last good result stays. Invalid parameter: the issue text next to the field.

## Visual rules
Existing tokens only (`--navy --ink --muted --faint --bench --line --line-soft --control --block --block-bg --review --review-bg --require --require-bg --pass --link --mono`), Libre Franklin, 3px radius on controls, 1px rules, sizes 12, 13, 15, 17, 20. Nothing above 20px. Page heading "Portfolio" as the existing `.view-lead h2` with one sentence under it: "One action checked against every property in the registry on one date."
Forbidden without exception: gradients, glows, blur, glass, new shadows, cards, pill badges, icon grids, hero copy, decorative charts, animated counters, entrance animations, all-caps labels, monospace outside the ruleset version, emoji, any figure not taken from a response. No map.
At 390px: controls stack, the grid wraps within the page, no horizontal page scroll (also check 768 and 1024).

## Tests (`tests/e2e/portfolio.spec.ts`), expectations from the API
- The four counts shown equal `POST /api/v1/checks` for the same request and sum to the number of grid cells; the grid has as many cells as `evaluated`.
- Two dates: find through the API two change points between which at least one decision differs; switch date by pressing the later change-point button; the changed line states the number of ids whose decision differs between the two API responses; counts update to the API's.
- A cell opens `/` with its property and the same action and date (the URL carries them).
- Sorting by legal city and filtering by one decision change the rows as expected (first row's city is the alphabetically first; all visible rows have the chosen decision).
- Keyboard: the controls, filter buttons and sort buttons are reachable and operable; focus visible.
- No console error, no failed request, no horizontal scroll at 390.

## Acceptance
`npm run check`, `npm run build`, `npm run test:e2e` green with counts in the handoff. Look at your own screenshots at 1440x900 and 390x844 (playwright-cli) before returning and say in the handoff what you saw and fixed.

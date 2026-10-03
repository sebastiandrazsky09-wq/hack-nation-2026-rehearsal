# Routes and shell (BUILD-2, phase 3)

Goal: replace the `?tab=` client state in `src/components/navigator.tsx` with real routes and a shared shell, keeping every behaviour and every browser test. This is a restructuring task. Do not restyle: keep `docs/DESIGN.md`, the tokens and classes in `src/app/globals.css`, the fonts and the signal marks exactly as they are.

## Routes
| Route | Nav label | Content |
|---|---|---|
| `/record` | Property record | The current address view, unchanged in behaviour: search, as-of date, needle, rule rows, evidence, change note, next change, copy link. State in the URL as `?address=&as_of=`. With no address it shows the current empty state (examples, the five-answer legend, tracked changes). |
| `/changes` | Law changes | The current "What is changing" panel. |
| `/system` | System | The current "How it was produced" panel followed by the rule registry (the current "All extracted rules" table, with its own as-of date field in the URL as `?as_of=`). |
| `/` | (none yet) | Until the Check screen exists: a legacy `?tab=` or `?address=` link redirects to the matching route with its parameters (`tab=address` -> `/record`, `tab=changes` -> `/changes`, `tab=pipeline` -> `/system`, `tab=audit` -> `/system#rules`); a bare `/` redirects to `/record`. Do the redirect on the server (`redirect()` in the page). |

## Shell
`src/components/shell.tsx`: top bar with the logo, the product name from `src/lib/product.ts` (`PRODUCT_NAME`, already exists), nav links (real `<a>`/`next/link` elements, the current route marked with `aria-current="page"`), and the "Not legal advice" notice exactly as today. The nav list is one exported array so later tasks can add "Check" and "Portfolio" in front. At 390px the nav scrolls sideways without clipping a label mid-word and the page never scrolls sideways.
Split `navigator.tsx` into the shell plus one component per view (`src/components/record/…`, and reuse `changes-panel.tsx`, `pipeline-panel.tsx`, `audit-table.tsx`). The address-and-date bar belongs to `/record` only; `/changes` and `/system` do not show an address search.
From `/changes`, choosing an affected address opens `/record?address=…&as_of=…` as today.
Add `src/app/icon.svg` from the existing logo mark (navy ground, white mark) so the favicon 404 stops.
Replace the red alert box at the top of the changes view by a neutral note placed on the affected case: keep `data-testid="changes-errors"` on it and keep the text of each warning, but it is a note about a source gap, not an error (no `role="alert"`, no error colours; use the existing `.gap` style).

## Tests
All 39 browser tests in `tests/e2e/` must still pass, migrated to the new routes. Tab clicks become nav-link clicks or direct `goto` of the route; `aria-selected` assertions become `aria-current="page"`. Do not delete a test and do not weaken an assertion; where a test checked "every tab", it now checks every route. Add: legacy `/?address=A0002&as_of=2027-07-02&tab=address` lands on `/record` with the same address and date; legacy `/?tab=changes` lands on `/changes`; no request returns 404 for the favicon; nav at 390px has no horizontal page scroll on every route.

## Hard rules
- Allowed paths only (see the task envelope). Do not touch `src/ordinal/`, `src/server/`, `src/app/api/`, `src/gate/`, `store/`, `out/`, `package.json`, `next.config.ts`.
- No new dependency. No new colours, fonts, shadows or radii.
- Every count, date and status on screen still comes from the API.

## Acceptance
`npm run check`, `npm run build`, `npm run test:e2e` all green (report the counts). Handoff lists the files moved, the tests migrated, and anything left for the Check screen task.

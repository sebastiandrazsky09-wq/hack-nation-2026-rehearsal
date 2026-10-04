# gate-routes handoff

Implementation commit: `7ece8a38515f0c252c1a4118771b1ad60f72e562` (base `6d66e37`). A second commit on the branch adds only this file.

## Behaviour
- `/record`, `/changes`, `/system` are real routes inside one shell (`src/components/shell.tsx`, mounted in `src/app/layout.tsx`). Nav links are `next/link` anchors; the current one has `aria-current="page"`. `NAV` is one exported array.
- `/record`: search, as-of date, needle, rule rows, evidence, change note, next change, copy link, empty state. URL state is `?address=&as_of=` (the `tab` parameter is gone). The address and date bar appears only here.
- `/changes`: the former "What is changing" panel. Choosing an affected address does `router.push('/record?address=…&as_of=…')`.
- `/system`: pipeline panel, then the rule registry in `<section id="rules">` with its own "As of" field, kept in the URL as `?as_of=` (omitted when it is the default date; the `#rules` hash is preserved).
- `/` redirects on the server (`redirect()` in `src/app/page.tsx`): `tab=changes` to `/changes`, `tab=pipeline` to `/system`, `tab=audit` to `/system[?as_of=]#rules`, anything else (including `tab=address`, `?address=`, or bare `/`) to `/record[?address=&as_of=]`. `/changes` takes no parameters, so `address` and `as_of` on a `tab=changes` link are dropped.
- `src/app/icon.svg`: the logo mark, white on navy (`#10213f`, square). Next serves it and links it, so the favicon 404 stops.
- Changes view: the red alert box is gone. A warning from `/api/changes` whose text starts with `TEST_ID:` is shown as a neutral `.gap` note (`data-testid="changes-errors"`, no `role="alert"`, text unchanged) on that case. A warning naming no case stays as one note above the cases.
- No new dependency, colour, font, shadow or radius. CSS changes: `.tabs button…` rules became `.tabs a…` (same values plus `inline-flex` centring and `text-decoration: none` for anchors), and three spacing rules (`#rules`, `.changes > .gap`, `.case > .gap`).

## Files
Moved or split from `src/components/navigator.tsx`:
- `shell.tsx` (top bar, nav, notice), `record/record-view.tsx` (search, date, URL state), `record/address-view.tsx` (the address view, unchanged), `record/empty-state.tsx` (examples, legend, tracked changes), `record/address.ts` (`AddressRow`, `optionText`, `cityName`).
- New: `changes-view.tsx`, `system-view.tsx`, `src/app/{record,changes,system}/page.tsx`, `src/app/icon.svg`.
- Edited: `changes-panel.tsx` (gap note), `layout.tsx`, `page.tsx`, `globals.css`.
- **`navigator.tsx` is now a two-line stub (`export {}`).** I could not delete it with the permitted commands. Delete it at integration; nothing imports it.

## Tests
All 39 original browser tests were kept, with no assertion weakened. Migration:
- `goto('/')` and `/?address=…` became `/record…`; the tab clicks became direct `goto` or nav-link clicks; `aria-selected` became `aria-current="page"`.
- "Not legal advice on every tab" and "no horizontal scroll on each tab" now loop over the three routes, with the registry checked on `/system`.
- The contrast and accessible-name tests run over `/record`, `/record?address=A0002…`, `/changes`, `/system`, `/system#rules`.
- The tracked-change link test now expects `/changes`. The affected-address test now expects `/record?address=<id>&as_of=<case date>`.
- `smoke.spec.ts` also asserts that `/` lands on `/record`.

Added (4): a source gap is a neutral note on its case with no alert; the registry's own `?as_of=` date; legacy links (`/?address=A0002&as_of=2027-07-02&tab=address`, `tab=changes`, `tab=pipeline`, `tab=audit&as_of=`, bare `/`); no favicon 404, with `/icon.svg` served as `image/svg+xml`.
The 390px test also asserts `documentElement.scrollWidth` and covers every route.

## Commands actually run
- `npm run check`: typecheck clean, vitest 13 files / 140 tests passed, secret guard passed.
- `npm run build`: compiled; routes `/`, `/record`, `/changes`, `/system` dynamic, `/icon.svg` static.
- `npm run test:e2e`: 43 passed, 0 failed (the second run, after fixing my new gap-note test, which first caught Next's own route-announcer `role="alert"` outside `<main>`; it now scopes to `main`).

## Not done or not checked
- I did not look at screenshots, in a browser or in `test-results/*.png`. "No restyling" is backed by unchanged CSS values and the contrast and 390px tests, not by a visual comparison. Spot-check the top bar and `/system` spacing (`#rules` has a 48px top margin I chose).
- The gap note's spacing on a case is untested visually.
- Behaviour against the live deployment was not tested; everything ran against `npm run start` with the local store.

## Risks
- `/changes` ignores `address` and `as_of` from a legacy link.
- Each route fetches `/api/addresses` itself (`/record`, `/changes`), so there is no shared cache between routes.
- The `NAV` order and labels (`Property record`, `Law changes`, `System`) are what the tests look up.

## Left for the Check screen task
- Add "Check" and "Portfolio" in front of `NAV` in `shell.tsx`.
- Replace the redirect branch of `src/app/page.tsx` with the Check screen. The legacy mapping must stay for `?tab=`, `?address=` links.
- Delete `src/components/navigator.tsx`.
- Update the `smoke.spec.ts` assertion that `/` lands on `/record`, and the legacy-link test's bare-`/` step in `firstuse.spec.ts`, once `/` stops redirecting.

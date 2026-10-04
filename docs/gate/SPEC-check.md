# The Check screen at `/` (BUILD-2)

The first screen is a decision, already evaluated when the page arrives. No landing copy. Read first: `src/gate/contract.ts` (shapes), `docs/DESIGN.md` (the design system: keep it), `src/app/globals.css` (tokens and existing classes), `src/components/decision-mark.tsx`, `src/components/gate-client.ts`, `src/components/timeline.tsx`, `src/components/record/record-view.tsx` (the address search to reuse), `src/server/gate.ts` (`gateData`, `defaultCheckRequest`).

## Allowed files
`src/app/page.tsx`, `src/app/check.css`, `src/components/check/**`, `src/components/record/**` (only to extract the address search into a shared component; behaviour of `/record` must not change), `tests/e2e/check.spec.ts`, and the two existing assertions that `/` redirects to `/record` (`tests/e2e/smoke.spec.ts`, `tests/e2e/firstuse.spec.ts`). All new CSS goes in `src/app/check.css` with class names starting `ck-`. Do not edit `globals.css`, `layout.tsx`, `shell.tsx`, `decision-mark.tsx`, `gate-client.ts`, anything under `src/gate`, `src/server`, `src/ordinal`, `src/app/api`, `src/components/portfolio`, `src/app/portfolio`.

## Server page (`src/app/page.tsx`)
- Keep the legacy redirects exactly as they are for `?tab=` and `?address=` links.
- Otherwise build the request from the URL and evaluate it on the server by calling `check(request, gateData())` from `src/gate/index.ts` directly (no HTTP hop), then render `<CheckView initialRequest initialResponse />`. The decision is in the HTML of the first response.
- URL parameters: `action`, `property`, `as_of`, `subject`, `amount` (months of rent), `fee` (US dollars), `units`, `year_built`. Validate with `CheckRequestSchema`; anything invalid or a thrown `GateError` falls back to `defaultCheckRequest()` (and the page shows the default, never an error page). Absent parameters come from `defaultCheckRequest()`.

## Client (`src/components/check/`)
State = the current request and the last response. Every change of a field re-checks through `postCheck` (debounce typed fields about 150 ms, reuse the `useSettled` idea in `src/components/record/address-view.tsx`; cancel a superseded request with an `AbortController`) and writes the request back to the URL with `history.replaceState`. Changing the action resets its parameter to the action's `example` value from `ACTIONS`.

### Layout, desktop: two columns inside the 1200px page: a 380px form on the left, the decision column on the right
Left, heading "Proposed action" (15px/700), a real `<form>`:
1. Actor: `<select>` over `SUBJECT_TYPES` with `SUBJECT_LABELS`.
2. Action: `<select>` of the three `ACTIONS` labels. Under it one line of 13px muted text: "Not gated: raise the rent, end a tenancy, screen an applicant. Their rules are in the property record." with "property record" linking to `/record?address=<id>&as_of=<date>`.
3. The action's parameter, if any: a number input labelled with `parameter.label` and its unit (for example "Deposit, months of rent"), `step` 0.5 for months and 1 for dollars.
4. Property: the address search from `/record`, extracted into `src/components/record/address-search.tsx` and used by both screens. Shows street, city, id.
5. As of: date input.
6. Facts, a small table of three rows (Year built, Units, Use) from `response.facts`: value and its source in words ("from the record", "supplied by you", "not in the record"). A fact that is `missing` and is one of `units` / `year_built` shows a number input in place of the value. A caller-supplied fact shows its value with a "Remove" button.
7. Submit button "Check" (navy, the existing primary style). Enter submits.

Right, top to bottom, in this fixed order. Sections 2 to 4 appear only when they have rows.
1. **Decision** (`data-testid="decision"`): a block with a 4px left border in the decision colour. First line: `<DecisionMark size={26}>` and the word at 30px/700 (`data-testid="decision-word"` on the word; the only element on the page above 20px). Second: `response.summary` at 17px/1.45, max 70ch. Third: one meta line at 12px, tabular figures, muted: decision id, ruleset version, as-of date, `evaluated_ms` rounded to one decimal with "ms"; the id and version in `var(--mono)`; each of the first two is a button that copies its value ("Copied" for 1.5 s in a `role="status"`). When a re-check changes the decision word, the block gets the existing 900 ms tint once and a line "Was {previous decision}." stays under the summary until the next change.
2. **Determining rules** (`data-testid="determining"`): a table: Outcome, Rule, Jurisdiction, Citation, Effect. Outcome in words with a small mark (violated: BLOCK mark; unresolved: REVIEW mark; obligation: REQUIRE mark; satisfied: PASS mark). The `detail` under the rule title at 13px. A `conflict_note` shows under the detail with the existing conflict flag mark.
3. **Before proceeding** (`data-testid="obligations"`, REQUIRE content, shown whenever `obligations` is non-empty, also under BLOCK or REVIEW): a list; each item is the obligation text, then its citation in muted 13px.
4. **Cannot resolve** (`data-testid="review"`): one row per `review` item: what is unresolved in plain words (use the `detail`; for `missing_fact` lead with "Missing: {fact names in words}"), and for each name in `resolvable_by` an inline labelled number input with a "Supply" button (Enter works). Supplying a fact puts it into `context.facts` and re-checks. This is the most important interaction on the page: it must be obvious that the input answers the question the row asks. The row for a `coverage_gap` says the gap sentence and that no fact can resolve it.
5. **Time** (`data-testid="time"`): the existing `TimeAxis` (needle, year scale) bound to as-of, then one button per `response.change_points` entry labelled "{short date}: {label}" (for example "1 Jan 2026: AB 325 takes effect"); pressing one sets the as-of date to that date. If `upcoming` is non-empty, list each upcoming rule under the buttons: title, "pending, not enacted" or "takes effect {date}", and when `would_be` is set "would be {decision}" with its mark.
6. **Trace** (`data-testid="trace"`): one `<details>` per rule in `response.trace`, closed by default; summary = rule result mark (existing `SignalMark`) + title + result word. Inside, a three-column grid of rows: check, outcome, detail. Rules whose result is `not_applicable` go in one further `<details>` "Rules outside this property ({n})". No prose paragraphs.
7. **Evidence** (`data-testid="evidence"`): for each `evidence` entry: the quote in the existing `.quote` style (Caslon 17/1.6) with a 3px left border in `var(--line)`; then one line: citation, source link (only through `safeHref`; otherwise the URL as plain text), document id, origin in words (`ORIGIN_LABELS`), retrieval date, verification method in words (`VERIFICATION_LABELS`), and whether it is the rule's sentence or the constraint's.
8. **Coverage** (`data-testid="coverage"`): one line: "Checked {rules_considered} rules for {jurisdictions joined}. {sources_unreadable} of {sources_read + sources_unreadable} listed sources could not be read." Then each `known_gaps` sentence on its own line with the REVIEW mark. Then `subject_note`.
9. **Request and response** (`data-testid="payload"`): a `<details>` "Request and response" with two tabs, "curl" and "JSON". curl = `curlFor(window.location.origin, '/api/v1/check', canonical request)`; JSON = the request and the response exactly as sent and received, pretty-printed, in `var(--mono)` 12.5px inside a scrollable frame. A "Copy" button for each. Under the panel, one line of 13px muted text, exactly: "Rental housing is the first policy domain. The request and response shapes are domain-neutral."

### 960px and below
The form collapses to a summary block above the decision: three short lines (the action label with its parameter, the property, the as-of date in words) and an "Edit" button that opens the full form in place. The decision follows directly, so the decision word is inside the first 844px at 390 wide. Tables become stacked rows. No horizontal page scroll at 390, 768 or 1024.

## States
- Loading a re-check: the decision column gets `aria-busy` and dims to 0.5 only if the answer takes longer than 150 ms (transition delay, as `.rules.is-stale` does). No spinner, no skeleton page.
- 400 with `issues`: show each issue next to its field (parameter, facts); keep the last good decision visible but marked "Not updated: the request is invalid."
- 404 unknown property, network failure, 5xx: a `role="alert"` line above the decision with the error message; the last good decision stays, dimmed.
- Empty sections are omitted, not shown as empty boxes.

## Visual rules (the same system, a different hierarchy)
Use only existing tokens: `--navy --ink --muted --faint --bench --line --line-soft --control --block --block-bg --review --review-bg --require --require-bg --pass --link --mono`, Libre Franklin for interface text, Caslon only for quoted source text, 3px radius on controls, none on rows, 1px rules, sizes 12, 13, 15, 17, 20 and the single 30. Section headings 13px/700 with a 1px bottom rule, like `.category > h3`.
Forbidden without exception: gradients, glows, blur, glass, new shadows, cards inside cards, pill badges, icon-plus-heading feature grids, hero copy, sparkle icons, decorative charts, animated counters, entrance animations, all-caps labels, monospace outside ids and payloads, emoji, any figure not taken from the response. No explanatory marketing copy.
Motion: the needle, the 900 ms changed tint, `<details>` opening. `prefers-reduced-motion` removes them.
Accessibility: every control labelled, visible focus, the decision block `aria-live="polite"`, contrast 4.5:1.

## Tests (`tests/e2e/check.spec.ts`), expectations from the API, never hand-written decisions
- The HTML of `GET /` (fetched with `request.get`, no browser) contains `data-testid="decision-word"` with one of the four words, and that word equals what `POST /api/v1/check` returns for `defaultCheckRequest`-equivalent input read from the page's own JSON panel.
- Missing fact then supplied: find through the API a property and action whose response has a `review` item with `resolvable_by` containing `units`; open it by URL; supply 24 in the inline input; the decision word, the facts row ("supplied by you") and the URL (`units=24`) match a second API call with `facts.units = 24`.
- A change point changes the decision: find through the API a property and change point where the decision before and on that date differ; press that change-point button; the word changes to the API's answer and "Was …" names the earlier one.
- The request panel: the JSON request shown, posted with `request.post`, returns the `decision_id` shown on the page.
- Invalid parameter (amount 0 or 13): field error shown, no crash.
- Keyboard: tab through the form in order, change the action with the keyboard, Enter re-checks; focus is visible on every control.
- No console error and no failed request during any of the above. No horizontal scroll at 390.
- Legacy links still land where they did (`/?address=…&tab=address` on `/record`).
Update the two existing assertions that a bare `/` redirects to `/record`: a bare `/` now shows the Check screen.

## Acceptance
`npm run check`, `npm run build`, `npm run test:e2e` green with counts in the handoff. Look at your own screenshots at 1440x900 and 390x844 (playwright-cli) before returning and say in the handoff what you saw and fixed.

# Handoff: ui-navigator

## What the page shows
1. Header: "Ordinal", one line on what it does, and a "Not legal advice" notice at the top of every state.
2. Address search (accessible name "Address") filters the 500 addresses by id, street or city, up to 8 matches. Chosen address shows year built, units and use, with "not in the data" for missing facts.
3. "As of" date input (default 2026-10-01) with quick buttons for the four dates. A bad or empty date shows a message and no cards.
4. Jurisdiction stack (state, county, legal city), resolution method and confidence in words, and the "Mailing city X; legal city Y." sentence when they differ.
5. Summary line, then rule cards under the six category headings (empty categories say "No rule found at this address for this category"). Cards carry badge, requirement, explanation, missing facts, caveats, conflict marker, effective date, citation, blockquote, source link, origin, retrieved date and as-of date.
6. Second tab "All extracted rules": table from /api/rules for the current as-of date, plus the count withheld as unverified.

## Behaviour notes
Data and answers come only from the API. The browser only counts results by badge for the summary line and compares postal city with legal city for the mailing-city sentence. Responses are keyed by URL, so a new address or date never shows an old card.

## Commands run (in this order)
- `npm run check`: typecheck clean, 68/68 unit tests passed, secret guard passed.
- `npm run build`: compiled successfully.
- `npm run test:e2e`: 10/10 passed (8 in navigator.spec.ts, 2 in smoke.spec.ts). One earlier run had 1 failure from my own test locator (matched Next's route announcer too); fixed in the test, then all three commands were re-run.

## Screenshots (gitignored)
- /Users/sebastiandrazsky/Developer/work-ui-navigator/test-results/navigator-desktop.png (1280x7826)
- /Users/sebastiandrazsky/Developer/work-ui-navigator/test-results/navigator-mobile.png (390x13779)

I opened both, but they are full-page captures shown downscaled, so I could only judge layout: header and notice on top, controls, six category sections in order, cards stacked, no sideways overflow. I could not read card text in them. Text-level checks are in the e2e assertions, not the screenshots. Mobile `body.scrollWidth` is asserted to be 390 (for both the cards view and the audit tab).

## API fields wanted and missing
None.

## Risks
- Visual polish was not reviewed at full resolution; the mobile page is very long (about 13,800px) because each card shows the full requirement and quote.
- `missing_facts` and `caveats` are shown as the API returns them (machine-ish names such as `owner_occupied`).
- Address suggestions are buttons in a list (no arrow-key navigation); they are reachable by Tab.
- Old starter CSS in globals.css was replaced entirely.

## Commit
Implementation SHA: see `git rev-parse HEAD` on branch task/ui-navigator (the handoff is committed with the implementation, so the SHA is reported in the lead message).

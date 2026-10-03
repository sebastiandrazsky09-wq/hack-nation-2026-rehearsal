# Handoff: ui-firstuse

## What changed for a first-time visitor
1. The empty state shows "Try an example" with four buttons (1978 Los Angeles building, mailing city differs from legal city, Hoboken, Cambridge). Each is picked from `/api/addresses` by property at run time and loads through the normal lookup. No address id is written in `src/components/`.
2. The address, the as-of date and the open tab are kept in the URL (`?address=&as_of=&tab=`) with `history.replaceState`, and read once on load. An unknown address, bad date or bad tab falls back to the default with no error. A "Copy link" button sits next to the address heading.
3. A plain-language sentence sits above the count buttons, built from the same counts: "On 2026-10-01, 6 rules apply at this address, 2 are overridden by another rule, and 3 cannot be determined from the data." Zero counts are omitted; no results gives "No rule in the extracted set reaches this address on this date."
4. A "Low confidence" mark appears beside the legal city when the method is `postal_fallback` or confidence is below 0.85, with the stack note underneath. In that case the note is not repeated in the "Resolution:" line.
5. Unknown cards with missing facts gain a "What would settle it" line: "Needs: <readable fact names>", using the existing `factName` mapping. "Not legal advice" is unchanged in every state.

## Interfaces
No API, server, label or page.tsx change. `labels.ts` untouched. Display only: the page still counts results by badge and compares postal city with legal city, as before.

## Commands run, in this order
- `npm run check`: typecheck clean, 12 files / 135 unit tests passed, secret guard passed, submission verifier passed.
- `npm run build`: compiled successfully.
- `npm run test:e2e`: first run 27 passed, 1 failed. The failure was my own new test (`getByRole('alert')` also matches Next's route announcer); I changed it to `.error`. Then re-ran all three commands: check 135/135, build compiled, e2e 28/28 passed (19 existing, unmodified, plus 9 new in `tests/e2e/firstuse.spec.ts`).

## Screenshot
`test-results/firstuse-desktop.png` (1280x720, gitignored). Checked: header and "Not legal advice" notice visible; empty Address box; "Try an example" heading with all four labelled buttons enabled and fitting without overflow; date quick-buttons unaffected; tabs unchanged. The text was readable at this resolution. Low-confidence and Needs lines are checked by e2e assertions, not by screenshot.

## Remaining risks
- "overridden by another rule" differs from the brief's example "overridden by a local rule": I did not assert the overriding rule is local, because the page does not know that.
- The "Needs:" line repeats the existing "What is missing" list (kept because an existing e2e test reads it); the card is slightly redundant.
- `confidenceWords` says "high" from 0.80, while the Low confidence mark starts below 0.85, so an address at 0.80–0.84 reads "high (0.82)" next to a Low confidence mark. I did not change it (outside the brief).
- Example buttons live in the Address tab's empty state, not in the controls, so they are not shown on the other tabs.
- Copy link relies on the clipboard API; on failure it says to use the address bar. The e2e test accepts either message, so it does not prove the copy itself succeeded.
- Examples depend on the data containing such addresses; a missing match shows a disabled button.

## Commit
Implementation SHA: see `git rev-parse HEAD` on branch task/ui-firstuse (reported in the lead message).

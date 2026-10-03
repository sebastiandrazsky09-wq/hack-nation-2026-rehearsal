# Fifth extraction pass: run, measured, rejected. Date-guard fix accepted.

Run 3 Oct 2026, 22:00–22:20 CEST, on an isolated clone of integration `fb4353d` (cloud workspace, Claude CLI route, Sonnet 5.5, 114 model calls, 66 documents, 101 candidates, 60 rules, 100% quotes verified).

## What v5 changed in the prompt
Rule 6a: effective_date is the operative date of the headline requirement (applicability clause first, then the law's own clause, then a code page's current-text version note); rule 3: never a headline, page title or "state law" as citation, and no record without a citation or an official name.

## Why the v5 store was rejected (compared with the general harness against fb4353d)
- Unknown results rose 1,748 → 2,213 (+465); applies fell 3,277 → 3,011. Drivers: lone `unavailable` exemptions reappeared on `CA-SCREEN` (Gov. Code §12955, +250 unknown), `CA-DEP` (§1950.5, +207), and two NJ statewide rules (+140 each). The coverage rules in the prompt were unchanged; this is model variance plus attention shifted by the new date wording.
- One wrong date introduced: §1947.12 effective 2024-04-01 (the SB 567 operative date in a history note, which the guard let through because "added by" sat on the previous line). Baseline had null, which is safer.
- `MA c.186 §15B` acquired effective 2025-08-01 from the version-note rule, although the one-month cap is decades old; the brief gives no date for §15B.
- Cambridge algorithmic-pricing policy order (pending) was dropped under rule 1d; defensible but a cell lost.
- T1–T5 sets were identical to baseline; schema valid; selfcheck ok. Not enough: the bar was strictly better with no regressions.

## What is accepted on this branch
`src/ordinal/dates.ts`: a new `version_note` context accepts a date that a code publisher's note gives as the effective date of the section's CURRENT text ("[ Text of section as amended by 2025, 9, Sec. 43 effective August 1, 2025. ...]"). The brief itself cites that section as "G.L. c.112 §87DDD½ (8/1/2025)". A note on the superseded text alone is still rejected. Regression tests in `tests/unit/ordinal/dates.test.ts` (D057 real text, synthetic current and superseded notes). `compile` records the provenance in status_basis.

Isolated effect, offline rebuild from the unchanged v4 cache: exactly one rule changes, `MA-FEE-d23b34` effective_date null → 2025-08-01. Lookups, changes.json (T1–T5), result mix and all other 57 rules are byte-identical to fb4353d. Two consecutive rebuilds are byte-identical. tsc clean; 131 unit tests pass; secret guard passes. Build and browser tests not run here (no Chromium in this workspace): run them at the gate.

Caveat for CONTROL: the guard now trusts version notes; if a future re-extraction makes the model emit a version-note date for a section whose requirement is older (c.186 §15B), the guard will accept it. The v4 cache does not contain such a date, so the current store is unaffected.

## Still open (unchanged by this pass)
- `CA-DEP-ab1666` (§1950.5) effective date null; the text states the cap applies to security collected on or after 2024-07-01 and the brief cites "AB 12, eff. 7/1/2024". Needs a prompt change that does not disturb coverage, or a targeted single-document re-extraction with a review of its coverage output before acceptance.
- Jersey City Ordinance 25-057: no admissible source; T2/T3 Jersey City sets stay empty.
- Unit-count policy: unchanged, awaiting the mentor decision.

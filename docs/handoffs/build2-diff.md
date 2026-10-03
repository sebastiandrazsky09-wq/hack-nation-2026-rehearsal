# build2-diff handoff

## How a case is evaluated
1. Rules are selected from data (`src/ordinal/diff/select.ts`): `team_rule_ids` exactly, `source_doc_ids` via `source_doc_id` or `also_supported_by`, `rule_ids` labels `<JUR>-<CAT>-<SEQ>`.
2. `applyAddress` runs over the FULL exportable rule set at each evaluated date, so precedence and conflict flags come from the engine; only the selected rules' results are read. `states` restricts addresses to stacks in those states.
3. `as_of` type: affected = addresses where at least one selected rule's result differs between before and after. Any other type: single date (`as_of` or default), affected = at least one selected rule with a result other than `not_applicable`.
4. conflict_flag_address_ids = addresses where a selected rule's result has `conflict_flag` at any evaluated date. `conflict_with` only appears in the notes.
5. Notes are template text (selectors, resolved ids with titles and legal status, dates, per-date result counts, affected and flagged totals). `runDiff` writes `changes.json` (all three keys per case, sorted ids, cases in test_id order, trailing newline).

## Commands run
- `npm test -- tests/unit/ordinal/diff/diff.test.ts`: first run 10 passed, 1 failed (my wrong test expectation: each P label selects the whole cell); after the fix see below.
- `npm run check`: typecheck OK, 10 test files, 115 tests passed, secret check passed.
- `rg` for test ids, organizer labels, address ids and city names in `src/ordinal/diff/`: no matches.
- `npm run ordinal -- diff` was NOT run (would write `out/`). The official `change_tests.json` has not been run through `runDiff` against the real store.

## Resolution rules as implemented
- JUR: exact state code among known and present jurisdictions; else the city whose word initials equal the code; else the single city whose letters-only upper-cased name starts with the code. Zero or several candidates: unresolved. Tested: JC, LA, SF, SD, SA, HOB, CAM, BOS, BER, CA, NJ, MA; `SAN` (ambiguous) and `ZZ` resolve to nothing.
- CAT: code table read back from `compile/ids.ts` through `teamRuleId` (the table itself is not exported and cannot be edited here), so nothing is duplicated.
- SEQ: starts with `P` selects pending or failed rules of that cell; a numeric SEQ selects enacted rules. The number is not used.
- Unresolvable or empty selectors never throw: empty list in `selected`, a sentence in the notes, and `<test_id>: <selector> resolved to no rule` in errors. Tested with `ZZ-ALG-01`, `NJ-RENT-01`, `garbage` and an unknown team id.

## Official change_tests.json versus the general definition
Nothing found that the definition cannot express. The expected behaviour of T2 ("neither for Newark") and T4 ("pending ... if enacted") is covered by the affected-set definition. Not verified on real data.

## Interface additions
`runDiff(options, deps?)`; `deps` takes `cases`, `casesFile`, `extraCasesFile`, `rules`, `stacks`, `addresses`. `casesFile` and `extraCasesFile` were added so the extra-cases path is testable without touching `store/`. `deps.rules` is used as given (assumed already exportable); without it the rules come from `buildExport(...).exported` with the engine stubbed.

## Risks
- The label SEQ number is ignored: if a jurisdiction has two enacted rules in one category, a label selects both.
- An extra case with an existing test_id replaces the official one (reported in errors).
- Addresses without a stack are skipped (one error line).
- No expected sets are published, so correctness against the organizer's answers is unchecked.

## Implementation SHA
See `git rev-parse HEAD` on branch `task/build2-diff` (reported in the final message; a commit cannot contain its own hash).

# Contracts (frozen 3 Oct 20:45 CEST; amended 21:00 after PROOF review, 21:50 and 22:25 after the extraction audits)
Code is the contract. Lead-owned, workers import and never redefine:
`src/ordinal/contracts.ts` (types, zod schemas) · `status.ts` (`deriveStatus`) · `corpus.ts` (loaders, file locations, rule store, stacks, unit bounds) · `dates.ts` (how a document words a date) · `policy.ts` (judgement switches) · `entrypoints.ts` (module signatures) · `cli.ts`.
A worker who needs a contract change stops and reports; it does not edit these files.

## Pipeline
`official/pack` + `supplemental/` + `store/ingested` → **compile** → `store/rules.jsonl` (InternalRule) → **resolve** → `store/stacks.json` → **apply** (pure) → **export** → `out/rules.json`, `out/lookups.json`, `out/changes.json`.
LLM extracts. Deterministic code decides. No model output reaches a result or an explanation.

## Rules that bind every module
1. **Quotes.** `assertRuleInvariants` rejects a store where `verified` contradicts the method or offsets, and export re-checks every quote against the document with `quoteMatchesSource`. A rule is `verified` only if `quoted_span === doc.text.slice(span_start, span_end)` for the stored file. Matching may normalize whitespace, quote marks, dashes and `§`; the exported span is always the literal slice. One repair attempt, then `verified=false`. Unverified rules stay in the store and never export as an affirmative answer.
2. **Citations and URLs.** `source_url`, `source_doc_id`, `retrieved_at` come from file/manifest metadata. `citation_in_source` records whether the citation's identifying tokens occur in the document.
3. **Jurisdiction of a rule** is the document's manifest jurisdiction or its parent state (a city page may describe a state law). For an ingested document without a manifest row it is extracted and must be `ST` or `City, ST`.
4. **Status** is never stored. Store `legal_status`, `enacted_date`, `effective_date`, `repeal_date`; call `deriveStatus(rule, asOf)`. Before its enactment date an enacted law is `pending`. No effective date means in force (the official sample record has `effective_date: null`, `status: in_force`).
5. **Coverage** is `CoverageSpec`: `requires` (all) and `exempt_if` (any group). Three-valued. Missing fact = unknown, never false. Year-only facts are intervals: if `[Y-01-01, Y-12-31]` straddles a cutoff, the condition is unknown. `unavailable` is always unknown; `caveat` never changes a result. `caveat` is only for tenancy-, unit- or special-housing wording (seasonal lets, dormitories, subsidised units): the official lookups template answers `applies` for a rule whose exemptions include seasonal rentals. Any property-level fact the data lacks is `unavailable`.
6. **Results.** Outside the rule's jurisdiction → `not_applicable` (omitted on export). If the stack's method is `unresolved`, city membership is not known: every city rule of that state is `unknown` with `missing_facts: ['legal_city']`, never `not_applicable`. `failed` → `not_applicable`. `pending` / `not_yet_effective` → that result for every address in jurisdiction whose coverage is not definitely false. In force: coverage true → `applies`, unknown → `unknown`, false → `not_applicable`.
7. **Precedence.** Only a state result of `applies` or `unknown` can change: with `yields_to_stricter_local` it is `superseded` where a city rule of the same category `applies`, and `unknown` where that city rule is `unknown`. A state rule that is not applicable, pending or not yet effective keeps its result. A state rule with `preempts_local` sets `conflict_flag` on itself and on the city rule of the same category at addresses both cover, at any status. A rule's own `conflict_flag` propagates to its lookups.
8. **No hardcoding.** No test IDs, organizer rule IDs, address IDs, expected sets or jurisdiction-specific branches in `src/`. T1–T5 appear only in tests and in `official/pack/dev/change_tests.json`.
9. **Determinism.** Sorted output, stable `team_rule_id` (jurisdiction + category + normalized citation), byte-identical reruns from the same store.
10. **Explanations** are template text built from `reason_code`, `missing_facts`, `caveats` in `src/ordinal/apply`. Every interface says "Not legal advice".

## Rules added after the audits
11. **Consolidation.** Candidates of one jurisdiction and category are grouped by law in a model call that returns ids only. The merge is code: a verified quote from the supplied corpus is the primary; `pending` plus a dated `enacted` is enacted, `pending` plus `failed` is failed, `enacted` against `failed` is flagged; headline values of co-documents are kept beside the primary's; coverage is taken from a co-document only when the primary states none.
12. **Effective dates.** A date is rejected when every mention in the document is an amendment note or the start of a rate period (`dates.ts`), at compile and again in selfcheck; a code page's note on the section's current text is accepted. A date is borrowed from a co-document only when the rule states its own enactment date and the lender's is compatible, or when the primary text states that same date itself. Two documents giving effective dates less than a year apart set a conflict flag.
13. **Unit counts.** `corpus.ts` reads the bounds a use description states; `POLICY.unitBoundsFromUseDescription` (off) decides whether they settle unit conditions. Explanations report the bounds either way.
14. **Change cases.** A selector that matches no rule is a warning, shown in the notes and the interface; it does not fail the run.

## Ownership
| Area | Paths | Owner |
|---|---|---|
| Contracts, CLI, package files, `official/`, `supplemental/`, `store/`, `out/`, docs | as listed | Lead |
| Compile, verification, rule store content | `src/ordinal/compile/`, `tests/unit/ordinal/compile/` | BUILD-1 |
| Resolver, engine, exporters, selfcheck | `src/ordinal/{resolve,apply,export,selfcheck}/`, `tests/unit/ordinal/engine/` | BUILD-2 |
| UI | `src/components/`, `src/app/globals.css`, `tests/e2e/` | UI task |
Only the lead holds provider keys and runs live extraction. Workers test with a fake model client and recorded outputs. Test fixtures live under `tests/`, never in `store/`.

## CLI
`npm run ordinal -- compile [--docs D065,D066] [--force] [--offline]` · `ingest PATH [--jurisdiction "City, ST"]` · `resolve [--ids ..] [--offline]` · `apply --as-of DATE [--address A0001]` · `export [--as-of DATE]` · `selfcheck`

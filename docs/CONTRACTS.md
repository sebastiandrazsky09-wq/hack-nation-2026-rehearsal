# Contracts (frozen 3 Oct 21:10 CEST)
Code is the contract. Lead-owned, workers import and never redefine:
`src/ordinal/contracts.ts` (types, zod schemas) · `status.ts` (`deriveStatus`) · `corpus.ts` (loaders, file locations, rule store, stacks) · `entrypoints.ts` (module signatures) · `cli.ts`.
A worker who needs a contract change stops and reports; it does not edit these files.

## Pipeline
`official/pack` + `supplemental/` + `store/ingested` → **compile** → `store/rules.jsonl` (InternalRule) → **resolve** → `store/stacks.json` → **apply** (pure) → **export** → `out/rules.json`, `out/lookups.json`, `out/changes.json`.
LLM extracts. Deterministic code decides. No model output reaches a result or an explanation.

## Rules that bind every module
1. **Quotes.** A rule is `verified` only if `quoted_span === doc.text.slice(span_start, span_end)` for the stored file. Matching may normalize whitespace, quote marks, dashes and `§`; the exported span is always the literal slice. One repair attempt, then `verified=false`. Unverified rules stay in the store and never export as an affirmative answer.
2. **Citations and URLs.** `source_url`, `source_doc_id`, `retrieved_at` come from file/manifest metadata. `citation_in_source` records whether the citation's identifying tokens occur in the document.
3. **Jurisdiction of a rule** is the document's manifest jurisdiction or its parent state (a city page may describe a state law). For an ingested document without a manifest row it is extracted and must be `ST` or `City, ST`.
4. **Status** is never stored. Store `legal_status`, `enacted_date`, `effective_date`, `repeal_date`; call `deriveStatus(rule, asOf)`.
5. **Coverage** is `CoverageSpec`: `requires` (all) and `exempt_if` (any group). Three-valued. Missing fact = unknown, never false. Year-only facts are intervals: if `[Y-01-01, Y-12-31]` straddles a cutoff, the condition is unknown. `unavailable` is always unknown; `caveat` never changes a result.
6. **Results.** Outside the rule's jurisdiction → `not_applicable` (omitted on export). `failed` → `not_applicable`. `pending` / `not_yet_effective` → that result for every address in jurisdiction whose coverage is not definitely false. In force: coverage true → `applies`, unknown → `unknown`, false → `not_applicable`.
7. **Precedence.** A state rule with `yields_to_stricter_local` is `superseded` where a city rule of the same category `applies`, and `unknown` where that city rule is `unknown`. A state rule with `preempts_local` sets `conflict_flag` on itself and on the city rule of the same category at addresses both cover, at any status. A rule's own `conflict_flag` propagates to its lookups.
8. **No hardcoding.** No test IDs, organizer rule IDs, address IDs, expected sets or jurisdiction-specific branches in `src/`. T1–T5 appear only in tests and in `official/pack/dev/change_tests.json`.
9. **Determinism.** Sorted output, stable `team_rule_id` (jurisdiction + category + normalized citation), byte-identical reruns from the same store.
10. **Explanations** are template text built from `reason_code`, `missing_facts`, `caveats` in `src/ordinal/apply`. Every interface says "Not legal advice".

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

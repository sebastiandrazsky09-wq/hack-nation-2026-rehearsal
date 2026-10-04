# Gate backend: decision layer and API (BUILD-1)

Read first: `src/gate/contract.ts` and `src/gate/store.ts` (frozen, lead-owned: do not edit), `src/ordinal/apply/index.ts`, `src/ordinal/apply/coverage.ts`, `src/ordinal/status.ts`, `src/ordinal/diff/select.ts`, `src/ordinal/corpus.ts`, `src/server/ordinal.ts`.

## Hard rules
- Do not edit anything under `src/ordinal/`, `store/`, `out/`, `official/`, `supplemental/`, `src/gate/contract.ts`, `src/gate/store.ts`, `src/gate/compile.ts`, `src/gate/model.ts`, `package.json`, `next.config.ts`. If the contract seems wrong, say so in the handoff; do not change it.
- The gate imports the engine. It never re-implements status, coverage or precedence. Use `applyAddress`, `deriveStatus`, `evaluateCoverage`, `selectRules`, `resolveJurisdiction`, `categoryCodes`, `loadManifest`.
- No model call. No clock except `performance.now()` for `evaluated_ms`. No randomness.
- No address id, organizer rule id, team rule id or expected count in `src/`. Tests may pick properties by attribute (legal city, missing units), never by a literal id list of expected answers.
- Every response and every error body carries `disclaimer` (reuse `DISCLAIMER` from `src/server/ordinal.ts`).

## Files to create
- `src/gate/decide.ts`: pure `decide()`. No I/O.
- `src/gate/trace.ts`: per-rule trace steps built from `deriveStatus`, `evaluateCoverage` and the result `applyAddress` returned.
- `src/gate/coverage.ts`: known gaps and source counts, from data.
- `src/gate/index.ts`: `check(request, data)` and `checkBatch(request, data)`.
- `src/server/gate.ts`: loads rules/addresses/stacks through the existing `dataset()` plus `readConstraints()` and `rulesetVersion()`; memoise like `dataset()` does.
- `src/app/api/v1/check/route.ts` (POST), `src/app/api/v1/checks/route.ts` (POST), `src/app/api/v1/actions/route.ts` (GET). All `export const dynamic = 'force-dynamic'`, `Cache-Control: no-store`.
- `tests/unit/gate/*.test.ts`.

## Decision semantics (`decide()`), every branch unit-tested with synthetic rules
Input: the action spec, its parameter value, the as-of date, and for each rule of the action's category the engine result (`ApplyResult` from `applyAddress`, facts already overlaid) together with that rule's verified constraints for this action, plus the known gaps for the property's jurisdictions and this category.

Per engine result:
- `not_applicable`, `superseded`: trace only.
- `pending`, `not_yet_effective`: goes to `upcoming` (with `would_be` = the decision that rule's verified constraints alone would give for this request, or null if it has none). Never affects the decision.
- `unknown`: one REVIEW item. Code from the engine `reason_code`: `missing_fact` -> `missing_fact`; `cutoff_ambiguous` -> `cutoff_ambiguous`; anything else (`unverifiable_condition`, `local_coverage_unknown`, `jurisdiction_unresolved`) -> `unverifiable_condition`. `missing_facts` passed through; `resolvable_by` = the missing facts that are in `SUPPLIABLE_FACTS` and that the record lacks.
- `applies`: evaluate each verified constraint of the rule:
  - `prohibit` with `elements_untestable === null` -> violated -> BLOCK.
  - `prohibit` with `elements_untestable` set -> REVIEW `conditional_prohibition` (detail quotes the untestable elements).
  - `limit` with request value `x`: if `max !== null && x <= max` -> satisfied. Else let `cap = hard_max ?? max`; if `cap !== null && x > cap` -> violated -> BLOCK. Otherwise -> REVIEW `limit_not_computable`.
  - `obligation` -> an entry in `obligations` -> REQUIRE.
  - `none` -> trace only.
  - the rule has no verified constraint for this action -> REVIEW `constraint_not_modeled`, detail = the rule's `requirement`.
- An applying rule with `conflict_flag`: if it produced BLOCK, keep BLOCK and carry `conflict_note` on the determining row; otherwise add a REVIEW `conflict` item.
- A known gap for (a jurisdiction of the property, the action's category) always adds a REVIEW `coverage_gap` item naming the gap. BLOCK still outranks it. A response in a known gap is never PASS or REQUIRE.

Aggregate with `DECISION_PRECEDENCE` (BLOCK > REVIEW > REQUIRE > PASS). `permit` is true only for PASS and REQUIRE.
`determining` lists only the rules that fixed the outcome: for BLOCK the violated rules; for REVIEW the unresolved ones; for REQUIRE the obligation rules and any limit the request stays within; for PASS the satisfied limits (possibly empty).
`summary` is template text. PASS uses `passSummary(asOf)` exactly, followed by the upcoming items in words and the coverage sentence. Never the words "legal" or "compliant".
`evidence`: for each determining rule, the rule's own `quoted_span` (kind `rule`) and each deciding constraint's `evidence_quote` (kind `constraint`), with source fields from the rule.

## Facts overlay
`context.facts.units` / `year_built` may be supplied only where the registry record has no value. A supplied value that differs from a recorded one -> 400 `fact_conflicts_with_record`; an equal value is accepted and stays `source: 'record'`. Overlay by passing `{ ...address, units, year_built }` to `applyAddress`. `facts` in the response lists `year_built`, `units`, `use_description` with `source` `record` | `caller` | `missing`.

## Known gaps (`coverage.ts`), from data only
1. For every case in the official change tests (`PATHS.changeTests`), every selector that `selectRules` resolves to zero rules, where the label parses as `<JUR>-<CAT>-<SEQ>` with a jurisdiction (`resolveJurisdiction`) and a category (`categoryCodes`), is a gap for that (jurisdiction, category).
2. A jurisdiction whose manifest rows are all unreadable (no row with `status === 'ok'` and a text file, and no team capture in `supplemental/text/<doc_id>.txt`) is a gap for every category in which the rule store holds no rule for that jurisdiction.
`coverage.sources_read` / `sources_unreadable` count manifest rows for the property's state and legal city. `known_gaps` are sentences naming the jurisdiction and category.

## `check()` and ids
- `as_of` defaults to `DEFAULT_AS_OF`.
- Rules considered: all rules of the action's category (`applyAddress` over those rules only is wrong, because precedence looks across the category: pass the category's rules, which is what precedence needs, since precedence only compares rules of the same category).
- `ruleset_version` = `rulesetVersion()`. `decision_id` = `'dec_' + sha256(JSON.stringify(canonicalRequest(req, asOf)) + ruleset_version).slice(0, 16)`.
- `change_points`: the distinct enactment, effective and repeal dates (full ISO dates only) of the category's rules that are not `not_applicable` at the property on the as-of date or would reach it by jurisdiction; label says what changes, for example "1 Jul 2027: Forbidding the Algorithmic Inflation of Rent (FAIR) Act takes effect". Sorted by date.
- `checkBatch`: `resources: 'all'` means every registry property in registry order; otherwise the given ids in order (unknown id -> 404 naming it). Facts in a batch are ignored unless the record lacks them for that property (never a conflict error in batch: a supplied fact is applied only where the record has none).
- `top_reason` per batch row: the first determining rule's title plus outcome, or the first review detail, or the PASS sentence.

## HTTP
- Body over `MAX_BODY_BYTES` -> 413 `body_too_large` (read the body as text and measure bytes before parsing).
- Invalid JSON or schema failure -> 400 `invalid_request` with `issues: [{ path, message }]` from zod. No stack, no file path, no zod internals dump.
- Unknown property -> 404 `property_not_in_registry`.
- Wrong method -> 405 `method_not_allowed` with an `Allow` header (export handlers for the other verbs).
- Any thrown error -> 500 `internal_error` with a fixed message. Wrap every handler in try/catch.
- `GET /api/v1/actions`: the three actions from `ACTIONS` with `modeled: true`, then `UNMODELED_CATEGORIES` with `modeled: false`, `parameter: null` and `name` = the category; plus subjects.
- Validate what you return with `CheckResponseSchema.parse` in tests, not in the handler.

## Tests (`tests/unit/gate/`)
1. Every `decide()` branch above with synthetic rules and constraints, including: BLOCK beats REVIEW; a conflict on a blocking rule stays BLOCK with the note; pending and not-yet-effective never decide; a gap never yields PASS or REQUIRE; limit with `max` and `hard_max` in all four combinations.
2. Scenario tests on the real store. Pick properties by attribute. Assert structure that holds whatever `store/constraints.jsonl` contains (it may be empty when you run):
   - A San Francisco property, algorithmic action, 2026-10-01: two rules have engine result `applies` in the trace; on 2025-12-31 the state rule is in `upcoming` as `not_yet_effective`.
   - A Newark property, algorithmic action: the state act is `pending` on 2025-12-31, `not_yet_effective` on 2026-10-01, `applies` on 2027-07-02 (read from `trace`/`upcoming`).
   - A Newark property with no unit count, deposit action, 2026-10-01: a REVIEW item with `missing_fact` and `resolvable_by` containing `units`; with `facts.units = 24` that item is gone and the fact is marked `caller`.
   - A Jersey City property, algorithmic action, 2026-10-01: decision REVIEW with a `coverage_gap` item; never PASS.
   - A supplied fact that contradicts the record -> the conflict error.
   - Batch, algorithmic action, all properties: `evaluated` is the registry size, counts sum to it, and BLOCK+REVIEW does not decrease across 2025-12-31, 2026-01-02, 2027-07-02.
   - Determinism: the same request twice gives the same `decision_id` and identical JSON apart from `evaluated_ms`.
   - Property test over all properties and the three actions (use the action's `example` parameter): no response is PASS or REQUIRE while any category rule is `unknown`, or `applies` with a violated or missing constraint, or while a known gap covers it; every response passes `CheckResponseSchema.parse`.
3. Route tests calling the handlers directly: 400, 404, 405, 413, disclaimer present in each.

## Acceptance
`npm run check` green. `npm run build` green. `npm run ordinal -- demo` then `git status` shows no change under `out/` or `store/`. Handoff lists what was built, any contract concern, and the measured time of a full batch.

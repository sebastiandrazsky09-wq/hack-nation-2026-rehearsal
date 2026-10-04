# Handoff: gate-backend

Branch `task/gate-backend`, base `6d66e37`. Implementation commit `e4fc2f3c19b0d50b811871a821bf265d373eb0cb` (`decide.ts` and its branch tests were committed first, before the rest). This handoff file is a separate, later commit.

## Built
- `src/gate/decide.ts`: pure `decide()`, plus `judgeConstraints` and `decisionOf`, which `trace.ts` reuses so the trace and the decision cannot disagree.
- `src/gate/trace.ts`, `coverage.ts`, `facts.ts`, `summary.ts`, `http.ts`, `index.ts` (`check`, `checkBatch`, `GateData`).
- `src/server/gate.ts`: `gateData()`, memoised on `rulesetVersion()`, so editing the rule or constraint store invalidates it in dev and production. It calls the existing `dataset()` only on a miss.
- Routes `POST /api/v1/check`, `POST /api/v1/checks`, `GET /api/v1/actions`: `force-dynamic`, `Cache-Control: no-store`, every other verb answers 405 with `Allow`.
- Tests in `tests/unit/gate/`: `decide.test.ts` (34), `scenarios.test.ts` (11), `routes.test.ts` (11).
- Nothing outside the allowed paths changed. The contract, the store module and the engine are untouched.

## Behavior worth knowing
- Known gaps come from data only. On the current store, Jersey City is a gap for algorithmic rent setting, found through change test T2 (`JC-ALG-01` resolves to no rule; `ordinal demo` prints the same warning). A Jersey City property therefore gets REVIEW with a `coverage_gap` item.
- **`store/constraints.jsonl` does not exist in this worktree.** With no verified constraints, every rule that applies is REVIEW `constraint_not_modeled`, so BLOCK, REQUIRE and a limit-based PASS never occur on the real store here. Those branches are covered only by the synthetic `decide()` tests. PASS on the real store comes only from "no rule in the category applies and no gap" (for example the Massachusetts addresses under pending bills). Re-run the scenario and property tests once the lead's constraint store lands.
- Batch ignores a supplied fact that contradicts the record; single check returns 400 `fact_conflicts_with_record`.
- `determining` has one row per deciding constraint (a rule with two violated constraints gives two rows), not one row per rule. `determining_rule_ids` in a batch row is deduplicated.
- `change_points` select rules by jurisdiction match (state equals the property's state, city equals its legal city), skipping `failed` rules. A city rule on an address whose city is unresolved is not listed.

## Measured
A full 500-property batch (`resources: 'all'`) takes about 8 to 10 ms of `evaluated_ms` for each of the three actions, with the data already loaded. The single measurement was taken in-process by calling `checkBatch` directly in vitest, not over HTTP, so it excludes JSON serialisation and the one-off `gateData()` load (which reads every source document). Counts on the current store for 2026-10-01: algorithmic action PASS 110, REVIEW 390; deposit and application-fee actions REVIEW 500. This figure is one run on one machine; I did not repeat it.

## Checks actually run
- `npm test -- tests/unit/gate/decide.test.ts`: 34 passed (before the first commit).
- `npm test -- tests/unit/gate`: 56 passed.
- `npm run typecheck`: clean.
- `npm run check`: green (16 files, 197 tests, secret guard passed, submission verifier ran without error).
- `npm run build`: green; the three `/api/v1` routes are listed as dynamic.
- `npm run ordinal -- demo`: selfcheck passed; `git status` afterwards shows nothing under `out/` or `store/`.
- Not run: `npm run test:e2e`, any live HTTP call against a running server, any browser check. The route tests call the handlers directly.

## Contract concerns (not changed)
1. `resolvable_by` is defined as the missing facts that are suppliable "and that the record lacks". After the overlay the engine only reports a fact as missing when neither the record nor the caller has it, so the filter reduces to `SUPPLIABLE_FACTS`.
2. `CheckBatchResponseSchema` has no per-row error or note, so a conflicting supplied fact is ignored silently, as the spec says; the caller cannot see that one was ignored.
3. The batch response has no `facts` field, so a batch caller cannot see which unit counts were applied from `context.facts`.

## Risks
- The scenario tests choose properties by attribute (legal city, missing units) and assert structure. They pass today without constraints; they have not been exercised against a populated constraint store.
- `summary` text includes rule titles and gap sentences. The property test checks that no response contains "legal" or "compliant" across the current store; a future rule title containing "legal" would trip it.

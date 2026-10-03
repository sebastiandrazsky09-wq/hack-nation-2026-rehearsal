# build1-consolidate handoff

## What changed in runCompile
1. Extraction is unchanged (chunking, `PROMPT_VERSION`, `SYSTEM_PROMPT`, extraction cache key and format). Each document now yields numbered candidates `<doc_id>#<n>` (n from 1, ordered by span_start, unverified last, then quoted_span).
2. Candidates are written to `<dir of ruleStorePath>/candidates.jsonl` (`{candidate_id, rule}` per line, sorted by id). A subset run replaces only the candidates of processed documents.
3. `consolidate` (new `consolidate.ts`) always runs over all candidates. Per (jurisdiction, category) cell: one candidate makes no call; two or more call `client.group`, cached at `<cacheDir>/groups/<sha256(GROUP_PROMPT_VERSION + model + sorted payload)>.json`.
4. Deterministic merge (`merge.ts`): primary is the model's pick unless a verified member beats an unverified one, then an official_captured verified member beats the rest; ties go to the model's pick, then the lowest candidate id. Every other member, same-document ones included, goes into `also_supported_by`. `conflict_flag` is set when verified members have different non-null `effective_date` or `legal_status`; the note lists each value with its doc_ids. `key_value` is not compared. Members' own conflict flags/notes are kept.
5. The whole rule store is rewritten from the groups. Invalid answer (missing, duplicated or unknown id, primary outside its group, empty group), a failed call, or offline with no cached grouping: singletons for that cell, reported in `docs_failed` as `cell:<jurisdiction>|<category>`. Invalid answers are not cached. `llm_calls` and `cache_hits` include grouping calls and hits.

`runCompile` signature and `CompileReport` are unchanged. `ORDINAL_PROGRESS` also prints candidates, cells, cells grouped, group calls and rule count.

## Interfaces
- `LlmClient.group(req: GroupRequest): Promise<GroupAnswer>` (new, required); implemented in `createProviderClient` and `createCliClient`.
- `GROUP_PROMPT` and `GROUP_PROMPT_VERSION = 'ordinal-group-v1'` are in `src/ordinal/compile/prompt.ts` (also re-exported from `compile/index.ts`).
- `mergeRules` is gone, replaced by `mergeGroup`/`choosePrimary` in `merge.ts`.

## Checks actually run
- `npm test -- tests/unit/ordinal/compile`: first run 35 passed, 2 failed (see below); after the fixture change see next line.
- `npm run check`: typecheck clean; 10 test files, 102 tests passed; secret guard passed.
- grep of `src/ordinal/compile/` for test ids, document ids, jurisdiction names and "Fair Chance": no matches.
- No live model calls. All new tests (`consolidate.test.ts`, 14 tests) use a fake `LlmClient` and temp directories.

## Existing tests changed
- `compile.test.ts`, shared `script()` fixture of "extraction cache": its second rule is now in category `security_deposits` instead of the same cell as the first. Before, the two same-cell candidates triggered a group call and group cache hit, so the tests expecting `llm_calls: 2` and `cache_hits: 1` failed with 3 and 2 (that count is correct under consolidation). The other 22 tests are untouched.
- `helpers.ts`: `fakeClient` gained a `group` callback (default: same citation = same law) and `groupCalls`; `calls()` now includes group calls.

## Lead must run after integration
- Live `runCompile` over the real corpus with the extraction cache warm: only grouping calls should happen (one per multi-candidate cell). Check rule count against the expected ~58 and read the `cell:` entries in `docs_failed`.
- Run it again: expect 0 calls and an unchanged store.

## Risks
- The first run after this lands has no `candidates.jsonl`; a subset run then rebuilds the store from the processed documents only. Run a full compile once first.
- A failed or invalid grouping call rewrites that cell as singletons, overwriting an earlier good consolidation until a later run succeeds.
- Groups whose primaries share a team_rule_id (same jurisdiction, category and citation) are merged into one rule, since the store needs unique ids. Rare edge: if the combined group then picks a primary with another citation, ids could still collide.
- Grouping quality is untested against a real model; the prompt is v1.
- Effective dates are compared as exact strings, so `2026` vs `2026-03-01` flags a conflict.

## Implementation SHA
See the commit that adds this file (`git rev-parse HEAD`); recorded in the lead's report.

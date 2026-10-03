# build1-compile handoff

Implementation SHA: `e934e090fddc52b38afa5100ce90fbd454300200` (base `a473f40`). This file is committed on top of it.

## What runCompile does
1. Resolves the document set: `deps.docs` or official + supplemental, plus every file in the ingest directory. `ingestPath` copies the file first and, when `docs` is not given, restricts the run to that document.
2. Chunks each document (24,000 characters, paragraph cuts, 1,500 overlap), then asks the cache, then (unless offline) the injected client, for rules per chunk.
3. Verifies every quote against the full document text (exact, then normalized). A failed quote gets exactly one `repair` call; still failing keeps the rule with `verified=false`, `verification_method="failed"`, null offsets. Rules with a disallowed jurisdiction are dropped and reported in `docs_failed`.
4. Builds `InternalRule` records (stable `team_rule_id`, `citation_in_source`, header provenance), merges same-id rules (verified + official first, rest in `also_supported_by`, `conflict_flag` on differing `effective_date`/`key_value`).
5. Replaces only the rules of processed documents in the store, keeps the rest, and writes the sorted store only if at least one document was processed.

## Behaviour added or decided beyond the design
- `LlmClient.model?` (optional readonly) feeds the cache key. Without a client, lookups try `configuredModelNames()` in order.
- Cache key = sha256(chunk text, `PROMPT_VERSION`, model, allowedJurisdictions). Allowed jurisdictions were added so an ingest with a given jurisdiction cannot reuse an answer produced without one.
- Repair answers are cached inside the chunk's cache file, otherwise a rerun would repeat repair calls. Offline never calls repair.
- `extraction_run_id` / `run_id` is deterministic (hash of prompt version, model, document ids and text hashes), required for byte-identical stores.
- Ingest keeps `store/ingested/index.json` (jurisdiction, fallback source_url, retrieved_at) beside the copied files, named `<doc_id>_<original name>`. This is the only way a later full run knows the jurisdiction and the ingest time; the file itself stays byte-identical.
- `docs_failed` also carries dropped-rule messages for documents that were still processed, so `docs_processed + docs_failed.length` can exceed `docs_requested`. `rules_*` counts describe the final store.
- `offline` wins over `force`.

## Checks actually run
- `npm test -- tests/unit/ordinal/compile`: 2 files, 23 tests; first run had 2 failures (both test mistakes: store order, which rule was picked), fixed.
- `npm run check`: typecheck clean, 7 test files / 51 tests passed, secret guard passed.
- `rg` over `src/ordinal/compile` for T1..T6, document ids, jurisdiction names, address ids and the example citations: no matches.
- `git status` after the tests: no `store/` or `out/` files. All tests write under `os.tmpdir()`.
- Not run: any live model call, the full corpus, the real `createProviderClient` (typechecks only).

## Locations
- System prompt: `src/ordinal/compile/prompt.ts` (`SYSTEM_PROMPT`, `REPAIR_PROMPT`), `PROMPT_VERSION = "ordinal-extract-v1"`, re-exported from `compile/index.ts`.
- Test fixture (hand-written, not model output): `tests/unit/ordinal/compile/FIXTURE-model-output-d065.ts`.

## First live run (lead)
- Set `ANTHROPIC_API_KEY` (model: `ORDINAL_MODEL` ?? `ANTHROPIC_MODEL` ?? `claude-sonnet-5-5`) or `OPENAI_API_KEY` (`ORDINAL_MODEL` ?? `OPENAI_MODEL` ?? `gpt-6.1-sol`). Anthropic wins when both are set.
- Start small: `npm run ordinal -- compile --docs D065` (flag parsing is in `cli.ts`, not exercised by me), then the full set. Afterwards `--offline` reports zero calls only if the same model name resolves.
- Watch `docs_failed`: dropped jurisdictions, schema failures and not-cached documents all land there, and `cli.ts` exits 1 whenever it is non-empty, even when the document was still processed.

## Awkward or ambiguous
- `RunCompile` takes no client, so the CLI path always builds the provider client lazily; tests use `deps`.
- "Dropped and counted as a document error" has no dedicated report field; it shares `docs_failed`.
- The report has no field for repair calls or dropped rules separately.

## Remaining risks
- One bad field in a model response (for example a date not in YYYY[-MM[-DD]]) fails the whole chunk and so the document; there is no per-rule salvage.
- Two distinct rules cited identically in one document share a `team_rule_id` and collapse into one.
- Subset recompile: if a processed document was the primary of a merged rule, support from unprocessed documents is lost until a full run (`also_supported_by` lacks the data to rebuild a primary).
- Offline lookups need the same model name; a run made with only an OpenAI key and a custom `OPENAI_MODEL` will miss unless the same env is set.
- Documents are processed sequentially; a full live run is slow. No concurrency or rate-limit handling beyond the SDK's `maxRetries: 2`.
- Prompt is a first version, untuned and untested against a live model. Key-value conflicts compare normalized strings, so "10%" vs "10 percent" would be flagged.

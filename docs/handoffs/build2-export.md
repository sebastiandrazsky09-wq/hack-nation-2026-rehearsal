# build2-export handoff

Status: **code and unit tests done; real export and selfcheck not run** (the task forbids producing `out/` files in the worktree). The lead runs `npm run ordinal -- export` and `selfcheck`.

## What runExport and runSelfcheck do
1. `runExport({ asOf = DEFAULT_AS_OF, outDir = PATHS.out }, deps?)` loads rules, stacks, addresses and documents (deps override each, plus `schemaPath` and a test-only `apply`) and calls `buildExport` in `export/build.ts`.
2. A rule is exportable only if `verified` and `quoteMatchesSource` holds against the text of the document with `doc_id === source_doc_id`. Anything else is withheld (`not_verified`, `source_document_missing`, `quote_does_not_match_source`) and appears in neither file. `rules_withheld_unverified` counts all of them.
3. `rules.json` holds records with exactly the 19 schema-named keys, sorted by `team_rule_id`, each validated with ajv (Ajv2020, `strict: false`). Failures become `"<id>: <message>"` in `schema_errors`; the files are still written. `overrides`/`interaction` come from precedence only (fixed sentences, `[]`/`null` otherwise).
4. `lookups.json` has a key for every address in `address_id` order, rows `{team_rule_id, result, explanation, conflict_flag}` from `applyAddress`, `not_applicable` removed. An address without a stack gets `[]` and a schema error.
5. `audit.json` records input hashes, provenance per exported rule, withheld rules and result counts. No timestamps or absolute paths; files are 2-space JSON with a trailing newline and byte-identical for identical inputs.
6. `runSelfcheck(deps?)` recomputes from the store, exports twice into temp directories (removed afterwards), compares bytes, derives the metrics and failures below.

## Engine amendment (apply/)
`jurisdiction_unresolved` added to `REASON_CODES`. When `stack.method === 'unresolved'`, every city rule whose state equals `stack.state` is `unknown` with `missing_facts: ['legal_city']`. A `failed` rule stays `not_applicable` (it is not law). Pending and not-yet-effective city rules also become `unknown` under an unresolved stack (the status result is not kept), which is the literal reading of rule 6. State rules and other states' city rules are unchanged. A resolved stack with `legal_city: null` keeps city rules `not_applicable`.

## Selfcheck metrics (as implemented)
`official_docs_expected` (manifest rows with status ok and a text file), `official_docs_processed`, `supplemental_docs_available`, `supplemental_docs_processed`, `ingested_docs` (a doc is processed when any `store/extraction` entry carries its `doc_id` or any rule cites it), `rules_total`, `rules_verified`, `rules_unverified`, `rules_exported`, `rules_withheld`, `rules_by_jurisdiction` and `rules_by_category` (JSON, exported rules), `rules_citation_not_in_source`, `rules_supplemental_only`, `conflicts` (distinct exported rules with a own flag or a flagged lookup row), `addresses_total`, `addresses_resolved` (stack exists and is not unresolved), `resolve_methods` (JSON), `lookup_addresses`, `lookup_rows`, `result_counts` (JSON), `schema_errors`, `empty_cells` (JSON list of `"jurisdiction|category"` over `KNOWN_JURISDICTIONS` x `CATEGORIES` with no exported rule).

## Selfcheck failures (as implemented)
Any schema error; zero rules exported; an exported rule failing `quoteMatchesSource`; a lookup row whose rule is not exported; an address missing from the lookups; any stack with method `unresolved`; a pending or failed rule with `applies`, `unknown` or `superseded` anywhere; an `applies` row for a rule not `in_force` at `as_of`; the two export runs differing in any file. `ok` is true when none fire.

## Checks actually run
- `npm test -- tests/unit/ordinal/export`: 2 files, 16 tests passed.
- `npm test -- tests/unit/ordinal/engine`: 3 files, 36 tests passed (includes the new `unresolved.test.ts`, 4 tests).
- `npm run check`: typecheck clean; vitest 12 files, 108 tests passed; secret check passed. One earlier typecheck error (ajv type guard narrowing) and one failing assertion (message order) were fixed before this run.
- Not run: `ordinal export`, `ordinal selfcheck`, anything against the real store. Fixtures are built in tests and temp directories; the engine is the real one except where a test injects a faulty `apply`.
- Source scan for test, rule and address ids in export/selfcheck/apply is a test in `export.test.ts`.

## Awkward or ambiguous
- Selfcheck exports twice into temp directories as specified; the metrics and checks use the first run's data.
- `rule_store_sha256` and `stacks_sha256` hash canonical JSON of the loaded objects (sorted), not file bytes, so injected deps hash the same way as files.
- `audit.json` includes each rule's `retrieved_at` as stored. If the store holds ISO datetimes, those appear in the audit; they are source metadata, not run time.
- Unresolved city rules reach `lookups.json` as `unknown`, so a real run with unresolved stacks lists them while selfcheck fails on the stack itself.
- `official_docs_expected` counts the manifest, so a manifest row without text (`link_only`) is not expected.

## Remaining risks
- ajv is imported as `ajv/dist/2020` with a `default` fallback for the CJS/ESM loader difference. Vitest runs it; the tsx path used by the CLI was not exercised (the CLI was not run here, and the earlier handoff reports an unrelated `@next/env` import problem in `cli.ts`).
- `quoteMatchesSource` for ingested docs relies on `loadIngestedDocs` returning text identical to what compile verified.
- Real-store behaviour (500 addresses, rule counts, empty cells) is unverified until the lead runs the commands.

## Commit
Implementation SHA: read with `git rev-parse HEAD` on `task/build2-export` (given in the return message).

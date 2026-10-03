# build2-engine handoff

Status: **partial**. Engine and resolver code are done and unit-tested. The 500-address live resolve was **not run**, so `store/geocode/` and `store/stacks.json` do not exist. Blocker below.

## Blocker (needs the lead)
`npm run ordinal -- resolve` fails before any module loads, on the first import in the frozen `src/ordinal/cli.ts`:

```
SyntaxError: The requested module '@next/env' does not provide an export named 'loadEnvConfig'
```
`@next/env` is CommonJS; under tsx's ESM loading the named import is not available. Proposed change (lead-owned file, not edited by me):
```ts
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
```
Every `ordinal` subcommand is affected, not only resolve. I had no permitted way to call `runResolve` live (no `node`/`tsx` directly, no new package script), so the geocoder was never contacted. After the fix: run `npm run ordinal -- resolve`, commit `store/geocode/` and `store/stacks.json`, then `npm run ordinal -- resolve --offline` and confirm `stacks.json` is byte-identical.

## Behavior implemented
**Resolve** (`src/ordinal/resolve/index.ts`, `variants.ts`): Census Geocoder `onelineaddress`, variants in order (as_given with ZIP, without_zip, range_first, range_last, unit_removed, house_letter_removed; duplicates dropped). Match requires matched state == row state. `legal_city` = `<Incorporated Places[0].BASENAME>, <state>`, else null with an "unincorporated" note. Confidence 0.95 as-given, 0.85 other variants. No match -> `postal_fallback`, 0.5, county null, neighbourhood table (Dorchester, Roxbury, East Boston, Brighton, Allston, South Boston, Jamaica Plain, Hyde Park, Mattapan -> Boston, MA; San Ysidro -> San Diego, CA) else `<postal_city>, <state>`. Raw responses cached at `store/geocode/<id>.json`; a cached address is never refetched; `--offline` never fetches (uncached -> method `unresolved`, listed in the report). 6 concurrent requests, 4 retries with 1s/2s/4s/8s backoff, 45 s timeout. A request that still fails after retries yields `unresolved` and writes no cache, so it is retried on the next run. `runResolve(options, deps?)`; deps inject `fetch`, `addresses`, `cacheDir`, `stacksPath`, `sleep`, `now`.

**Apply** (`src/ordinal/apply/`): `applyRule` and `applyAddress` per CONTRACTS rules 5-7, pure (no Date/clock/random; month arithmetic is done on ISO strings). Conditions are three-valued over intervals. A partial threshold date follows the operator: `lte`/`gt` use the end of the period, `lt`/`gte` the start ("on or before 1979" includes 1979; "before 1979" excludes it). `building_age_years` is turned into a year_built comparison against `asOf` minus N years. Missing `year_built`/`units` and `unavailable` conditions put their name in `missing_facts`; an interval that straddles a cutoff is unknown with no missing fact. `missing_facts` is filled only when the result is open (unknown, or pending/not_yet_effective with unknown coverage).

reason_code list (exported as `REASON_CODES`): `covered`, `outside_jurisdiction`, `status_failed`, `status_pending`, `status_not_yet_effective`, `exempt`, `requirement_not_met`, `missing_fact`, `cutoff_ambiguous`, `unverifiable_condition`, `superseded_by_local`, `local_coverage_unknown`.

## Checks actually run
- `npm test -- tests/unit/ordinal/engine`: 2 files, 29 tests passed.
- `npm run check`: typecheck clean; vitest 7 files, 57 tests passed; secret check passed.
- `npm run ordinal -- resolve`: FAILED (blocker above). Not run: `resolve --offline`, byte-identity check, method distribution.

## Not done / evidence missing
- Method distribution over 500 addresses, non-geocoder and null-legal_city list, and legal_city vs postal_city differences: unavailable until the live run.
- Fixtures are built inside the tests; the geocoder is a fake `fetch`, not the live service.

## Ambiguities and decisions
- `yields_to_stricter_local`: only a state result of `applies`/`unknown` is changed. A state rule that is pending or not yet effective keeps that result. If the city rule is `unknown` and the state rule is itself `unknown`, the state keeps its own reason.
- `caveat` inside an exempt group makes that group false (as specified), so `[units <= 2, caveat]` can never exempt.
- Explanations do not carry "Not legal advice"; rule 10 says the interfaces do. Say if you want it in the template.
- Results sort by plain code-point order of `team_rule_id`, not `localeCompare` (the rule store uses `localeCompare`; the two can differ for ids with punctuation).
- `resolve` falls back to `unresolved` (not `postal_fallback`) when offline with no cache or the geocoder is unreachable.

## Remaining risks
- Live behavior of the Census response shape (`States[0].STUSAB`, `Incorporated Places[0].BASENAME`) follows the task description and public docs but is untested against the real service.
- Place names with a suffix quirk (e.g. "Urban Honolulu") would pass through BASENAME unchanged; none expected in CA/NJ/MA.

## Commit
Implementation SHA: the commit on `task/build2-engine` after base `a473f40`; read it with `git rev-parse HEAD` (given in the return message).

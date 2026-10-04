# Mortise

**Live:** https://hack-nation-machine-rehearsal.vercel.app · **Method note:** [one page, PDF](docs/Mortise-Method-Note.pdf) ([source](docs/METHOD.md)) · **Submission files:** [out/](out/) · **Current numbers:** [STATUS.md](STATUS.md)

The legal envelope for actions governed by external law. Software asks what is permitted for an action on a property; Mortise returns the permitted range, the facts that decide it and the dates on which the answer changes, each with the rule and the quoted sentence of law behind it, from quote-verified compiled rules with no model at runtime. Give it one specific amount and date and it answers **PASS, BLOCK, REQUIRE or REVIEW**: the same computation at a single point. Rental housing is the first policy domain: three actions (set rents with a pricing algorithm that uses non-public competitor data, collect a security deposit, charge an application fee) across the 500 sample properties of Hack-Nation 7, Challenge 02 (RealPage Rental Housing Law Navigator).

Underneath is Ordinal, the navigator the challenge scores (the engine, its CLI `npm run ordinal` and the files keep that name): for any of the 500 addresses it says which rental-housing rules apply on a given date, with the exact source sentence, and which addresses each law-change case affects. The gate is a thin layer over that engine and does not change its outputs.

**Not legal advice.** A prototype that reads public law. Check the cited source before acting.

## The envelope

```bash
curl -s -X POST https://hack-nation-machine-rehearsal.vercel.app/api/v1/envelope -H 'content-type: application/json' -d '{
  "subject":  { "type": "software_agent" },
  "action":   { "name": "collect_security_deposit" },
  "resource": { "type": "property", "id": "<an address_id from /api/addresses>" },
  "context":  { "as_of": "2026-10-01" }
}'
```

The request is a check request with the amount left out. The response carries:

- `permitted`: the amount's whole range cut into intervals, each with the decision inside it and, where a rule's verified bound ends the interval, that rule, its citation and the words that state the bound ("one and one-half times one month's rent").
- `decides`: for each fact the record lacks and the answer depends on (unit count, year built), the regions of that fact and what each yields. Supply the fact in `context.facts` and the axis is gone.
- `timeline`: date intervals covering all time, each with its outcome and the rule event that starts it (a law taking effect, a figure stated for one year running out).
- `obligations` that attach inside the permitted range, the `review` points that cannot be settled, the quoted `evidence`, and an `envelope_id` that is a hash of the request and the ruleset version: same question, same id.

How it is computed: `envelope()` runs the same decision function as `check()` at every threshold already present in the compiled rules (verified constraint bounds, coverage thresholds, rule dates) and merges neighbours with the same answer. It is enumerated over those thresholds, not derived symbolically. A unit test samples both ends and the middle of every reported interval, for a fifth of the properties and every action, and requires `check()` to return the interval's decision there. "Permitted" means no modeled constraint is violated within the represented coverage; it does not mean legal. Conditional bans and coverage gaps stay REVIEW and appear as REVIEW on every axis. We found no other service returning this for compiled law as of 4 October 2026; that is one afternoon of searching, not proof.

## The check

Against a local server; the same request works against the live URL above.

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/check -H 'content-type: application/json' -d '{
  "subject":  { "type": "property_manager" },
  "action":   { "name": "collect_security_deposit", "properties": { "amount_months_rent": 2 } },
  "resource": { "type": "property", "id": "<an address_id from /api/addresses>" },
  "context":  { "as_of": "2026-10-01", "facts": { "units": 24 } }
}'
```

The response carries `decision`, `permit`, a `decision_id` (a hash of the request and the ruleset version, so the same request always gives the same id; it is not a stored log), the `determining` rules, `obligations`, `review` items naming what cannot be settled, `upcoming` law not yet in force, a per-rule `trace`, the quoted `evidence`, the `facts` used and where each came from, `coverage` including known gaps, and `change_points` (the dates on which the answer can change). `POST /api/v1/checks` runs one action over many properties; `POST /api/v1/envelope` is described above; `GET /api/v1/actions` lists what can be checked.

| Decision | Means |
|---|---|
| BLOCK | A rule in force at the property prohibits the action, or caps it below the requested value. |
| REVIEW | It cannot be settled: a needed fact is missing, a ban depends on something the gate cannot observe (an agreement, coercion), a cap depends on a figure the data lacks, a rule applies that has no verified constraint, a conflict is flagged, or the sources for that place and category are a known gap. |
| REQUIRE | Nothing in force is violated, and duties attach (a receipt, a separate account, a notice). |
| PASS | No modeled constraint is in force, or the request is within the modeled limits. It does not mean "legal". |

How a rule becomes something an action can be checked against: `npm run ordinal -- constrain` asks a model, once per rule in the three action categories, for typed constraints (prohibit, limit with a figure, obligation). A constraint is kept only if its quote is a literal slice of the rule's source, a ban's quote contains words that forbid, a duty's quote contains words that require, and every figure is read back out of the quoted words by a fixed parser. Anything else is withheld, and a withheld constraint can only produce REVIEW. The lead read every record of the first pass and rejected three (`store/constraints.review.json`). No model runs at request time; `npm run ordinal -- constrain --offline` replays the step from the committed cache.

Limits of the gate, stated plainly: a verified quote proves the sentence is in the source, not that it was read correctly. Uncertainty resolves to REVIEW, never to a guess. Rent increases, eviction and screening are shown in the property record but are not gated, because their rules are formulas or procedures the gate cannot test. Caller-supplied facts (`units`, `year_built`) are accepted only where the registry has none; a value that contradicts the record is refused.

## How it works

```
official/pack (54 supplied texts) + supplemental/ (team-captured pages) + store/ingested (documents added later)
  -> compile    a language model proposes structured rules; every quote is then found character for character in its source
  -> consolidate one rule per law per jurisdiction and category; disagreements between documents are flagged, not resolved
  -> resolve    each address is placed in its legal city with the U.S. Census Geocoder (the mailing city is not trusted)
  -> apply      fixed code tests dates, jurisdiction and building facts; a missing fact gives "unknown", never a guess
  -> export     out/rules.json, out/lookups.json, out/changes.json, out/audit.json, out/selfcheck.json
```

The model extracts. Deterministic code decides. No model output reaches a result or an explanation, and the web app makes no model call.

- A rule is exported only if its quote is the literal slice `text[span_start:span_end]` of its source file. This is checked at extraction and again at export.
- Status is never stored. `enacted`, `pending` or `failed` plus the dates are stored, and the status for any query date is derived from them.
- Coverage conditions are data (`requires` / `exempt_if` over year built, unit count and facts the dataset lacks), evaluated in three-valued logic. A building year that straddles a certificate-of-occupancy cutoff is `unknown`.
- A state rule that yields to a stricter local rule is `superseded` where the local rule applies. A state rule whose text bars conflicting local ordinances sets a conflict flag on both rules for human review.
- Nothing in `src/` names a test, an organizer rule id or an address id.

## Run it

Requires Node 22.

```bash
npm ci
npm run build && npm run start        # http://127.0.0.1:3000
```

Rebuild every output from the committed store, with no model call and no network:

```bash
npm run ordinal -- compile --offline  # replays the cached extraction (store/extraction)
npm run ordinal -- resolve --offline  # replays the cached geocoder responses (store/geocode)
npm run ordinal -- export             # out/rules.json, out/lookups.json, out/audit.json
npm run ordinal -- diff               # out/changes.json
npm run ordinal -- selfcheck          # out/selfcheck.json; exits 1 if an invariant fails
npm run ordinal -- constrain --offline  # store/constraints.jsonl, replayed from store/constraints/ with no model call
```

Or all five steps with a one-line summary each: `npm run ordinal -- demo`. An independent check of the three submission files, sharing no code with the pipeline: `npm run verify`.

Other dates: `npm run ordinal -- export --as-of 2027-07-02`. One address: `npm run ordinal -- apply --address A0002 --as-of 2026-10-01`.

Extract again from the documents (calls a model): `npm run ordinal -- compile --force`. Set `ANTHROPIC_API_KEY` (model from `ORDINAL_MODEL`, default `claude-sonnet-5-5`) or `OPENAI_API_KEY`. With no key set, the Claude Code CLI login is used.

### Add a law the system has never seen

```bash
npm run ordinal -- ingest path/to/new_ordinance.txt --case NEW1   # jurisdiction, category, dates and conditions are read from the text; --case adds a change case for it
npm run ordinal -- export && npm run ordinal -- diff && npm run ordinal -- selfcheck
```

The file may be plain text, PDF (`pdftotext`), Word `.docx` or HTML; a converted file is stored as text with a line saying how it was made, and the original is kept beside it. No source change is needed. `rehearsal/run.sh rehearsal/synthetic_cambridge_1.txt 2027-03-02` does this in a throwaway copy of the store with a synthetic ordinance and prints the extracted rule and the affected addresses.

## Checks

```bash
npm run check       # typecheck, unit tests, secret scan
npm run test:e2e    # browser tests (run npm run build first)
```

## Where things are

| Path | What |
|---|---|
| `official/pack/` | The organizers' starter pack, unmodified and read-only |
| `supplemental/` | Pages we captured for manifest rows that had no supplied text, each with its own source header |
| `store/` | Extraction cache, candidates, consolidated rules, geocoder responses, jurisdiction stacks, added documents |
| `out/` | Submission files and the audit and selfcheck reports |
| `src/ordinal/` | The pipeline; `contracts.ts`, `status.ts`, `corpus.ts` are the frozen contract (`docs/CONTRACTS.md`) |
| `src/gate/` | The decision layer: contract, constraint compile step, `decide()`, trace, coverage gaps |
| `src/app`, `src/components` | The web interface (`/` check, `/portfolio`, `/record`, `/changes`, `/system`) and the API (`/api/v1/*` for the gate, `/api/*` for the navigator) |
| `docs/RECONCILIATION.md` | Where the official files and our brief disagree |
| `STATUS.md` | Current numbers |

## Known limits

- Rules exist only where a readable source exists. The supplied pack has no text for Hoboken or Newark, and code-publisher pages refuse scripted reads, so those cities are thin.
- When the dataset has no unit count or year built, every rule that depends on it is `unknown`.
- Extraction is one model pass with one quote-repair attempt. A verified quote proves the sentence exists in the source, not that the structured reading of it is right.
- The corpus has not been reviewed by counsel, and neither has this output.

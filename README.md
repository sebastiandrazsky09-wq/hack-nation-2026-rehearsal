# Ordinal

For any of the 500 sample addresses, Ordinal says which rental-housing rules apply on a given date, shows the exact sentence of law behind each answer, and reports which addresses each law-change case affects. Built for Hack-Nation 7, Challenge 02 (RealPage Rental Housing Law Navigator).

**Not legal advice.** A prototype that reads public law. Check the cited source before acting.

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
```

Or all five steps with a one-line summary each: `npm run ordinal -- demo`. An independent check of the three submission files, sharing no code with the pipeline: `npm run verify`.

Other dates: `npm run ordinal -- export --as-of 2027-07-02`. One address: `npm run ordinal -- apply --address A0002 --as-of 2026-10-01`.

Extract again from the documents (calls a model): `npm run ordinal -- compile --force`. Set `ANTHROPIC_API_KEY` (model from `ORDINAL_MODEL`, default `claude-sonnet-5-5`) or `OPENAI_API_KEY`. With no key set, the Claude Code CLI login is used.

### Add a law the system has never seen

```bash
npm run ordinal -- ingest path/to/new_ordinance.txt   # jurisdiction, category, dates and conditions are read from the text
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
| `src/app`, `src/components` | The web interface and its read-only API |
| `docs/RECONCILIATION.md` | Where the official files and our brief disagree |
| `STATUS.md` | Current numbers |

## Known limits

- Rules exist only where a readable source exists. The supplied pack has no text for Hoboken or Newark, and code-publisher pages refuse scripted reads, so those cities are thin.
- When the dataset has no unit count or year built, every rule that depends on it is `unknown`.
- Extraction is one model pass with one quote-repair attempt. A verified quote proves the sentence exists in the source, not that the structured reading of it is right.
- The corpus has not been reviewed by counsel, and neither has this output.

# Ordinal: method note

**Question answered.** Which rental-housing rules apply at this address on this date, what is the source sentence, and which addresses does each law-change case affect? Not legal advice.

**Principle.** A language model reads law. Fixed code decides. No model output reaches a result or an explanation.

## Module A: rule extraction
1. Each supplied text (54), each team-captured page for a link-only source, and each document added later is cut into overlapping chunks at paragraph boundaries, with character offsets kept.
2. A model (Claude Sonnet 5.5, temperature 0, schema-constrained output) proposes one record per law per category: jurisdiction (limited to the document's own jurisdiction or its parent state), category, requirement, key value, penalty, citation, legal status (enacted, pending, failed), enactment and effective dates, coverage conditions, precedence wording, and a quote.
3. **Every quote is checked mechanically.** It must occur in the source file; whitespace, quote marks and dashes may differ, and the exported span is always the literal slice of the file. One repair attempt, then the rule is withheld. The check runs again at export.
4. Candidates describing the same law (several provisions, or several documents) are grouped by a second model call that returns ids only. The merge is deterministic: a verified quote from the supplied corpus is preferred; a draft marked pending plus an adopted text is an enacted law; a date is taken from another document only when the rule states its own enactment date or its own text states that same date; two documents giving effective dates less than a year apart set a conflict flag with both values.
5. **Dates are checked mechanically too.** An effective date that the document words only as the latest amendment's date, or as the start of an annual rate period, is rejected at extraction and again in selfcheck.
6. Source URL, document id and retrieval date come from the file header and manifest, never from the model. Whether the citation's section numbers occur in the document is recorded.

## Module B: address lookup
1. Each address is sent to the U.S. Census Geocoder; the legal city is the incorporated place returned, not the mailing city. Candidates in two different places are never settled by taking the first. Raw responses are cached. Seven addresses with no house number fall back to a small table of postal neighbourhood names, marked low confidence.
2. Status on the query date is derived from legal status and dates: pending and failed never become in force; an enacted law is not yet effective before its effective date.
3. Coverage conditions are data: `requires` and `exempt_if` over year built, unit count, and facts the dataset does not hold. Evaluation is three-valued. A missing year or unit count, an owner-type test, or a building year that straddles a certificate-of-occupancy cutoff gives **unknown**, with the missing fact named.
4. A state rule that yields to a stricter local rule is `superseded` where the local rule applies. A state rule whose text bars conflicting local ordinances puts a conflict flag on both rules at the addresses they share.

## Module C: change tracking
A change case selects rules from data (jurisdiction and category codes in the organizer label, or document ids). For a two-date case the affected set is every address whose result changes between the dates; for a single-date case it is every address the selected rules reach. Conflict-flagged addresses come from the engine's precedence step. Nothing in the source names a test, an organizer rule or an address.

## The decision gate (a layer over Modules A and B)
`check(subject, action, resource, context)` returns PASS, BLOCK, REQUIRE or REVIEW for one of three actions at a property on a date. It runs the engine of Module B over the action's rule category and then tests each applying rule's typed constraints against the request. Constraints come from a second compile step with the same discipline as Module A: a model proposes, and a record is kept only if its quote is a literal slice of the source, a ban's quote contains words that forbid, a duty's quote contains words that require, and each figure is read from the quoted words by a fixed parser. Engine `unknown`, a conditional ban, a cap the data cannot compute, a rule with no verified constraint, a flagged conflict and a known source gap all give REVIEW. Pending and not-yet-effective law never decides; it is listed as upcoming. The decision id is a hash of the canonical request and the ruleset version. No model runs at request time, and the scored outputs are untouched.

## A law the system has not seen
`ordinal ingest FILE` copies the file (text, PDF, Word or HTML; a converted file keeps its original beside it), extracts it with the same prompt, reads the jurisdiction from the text, regroups only the affected cell, and the usual export and diff regenerate every output. No source change.

## Audit trail and reproducibility
Every export writes `audit.json` (input hashes, source document, retrieval date, quote offsets and verification method per rule) and `selfcheck.json`. Selfcheck fails if a quote no longer matches its source, a pending or failed rule produces an answer in force, an address is unresolved, a record breaks the official schema, or two exports differ by a byte. All model output is cached, so every result is rebuilt offline from the committed store.

## Limits
Rules exist only where a readable source exists; Hoboken and Newark have no supplied text. A verified quote proves the sentence is in the source, not that the structured reading is right. No answer key was available, so accuracy against the organizers' expectations is unmeasured.

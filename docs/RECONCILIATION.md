# Reconciliation: official pack vs CONTROL prompt
Official files win. Pack source: PO's local download of 3 Oct 19:26 CEST, copied read-only to `official/pack/` (our hashes: `official/PACK_SHA256.txt`). The organizers' Drive folder is not visible to the Drive connector, so this copy has not been compared with the live folder.

| # | Topic | Official pack says | Prompt says | Decision |
|---|---|---|---|---|
| 1 | Mid-event release | Brief p.2: "No surprise document or mid-event release is required." p.4: five cases "all defined at kickoff". File name: `...no-scoring-no-hour16.pdf` | T6 fictional Cambridge ordinance at hour 16 | **Unverified.** Keep `ordinal ingest` (cheap, also the "new jurisdiction" stretch). PO to confirm with organizers. |
| 2 | Scoring | Nothing. No `score.py`, no dev key, no weights | 75 automated / 25 judged; key of 58 rules + 19 "no rule" findings | Treat weights as unverified. Build selfcheck from schema, templates, README, T1–T5. |
| 3 | Submission package | Brief p.6 adds a **one-page method note** | Not listed | Added to STATUS submission list. |
| 4 | Manifest `sha256` | Matches none of the 54 supplied text files (tried raw, CRLF, header stripped) | "verify hashes" | Cannot verify; likely hashes of the raw capture. We keep our own SHA-256 list. |
| 5 | Manifest counts | 87 rows: 54 ok, 32 link-only, 1 manual/403 (D056). `links_only.csv` has 33 rows | Same | Agrees. |
| 6 | Addresses | 500 rows; 212 without `year_built`, 242 without `units`; postal names as listed | Same | Agrees. All 80 LA rows say "Los Angeles" (README's "Van Nuys" example does not occur). A0003 is Newark with ZIP 11219 (bad ZIP). |
| 7 | `changes.json` | Template: T1 has no `conflict_flag_address_ids`, T3 has. README §5 gives all three keys | "exact official template" | Emit all three keys for every test; empty list when none. |
| 8 | Penalty | Brief Module A lists "penalty" | Not in schema | Internal `penalty` field; not exported as a separate key. |
| 9 | Rule schema | No `additionalProperties: false`; `coverage_conditions` string/object/null | — | Export only schema-named keys; `coverage_conditions` and `exemptions` as strings. |
| 10 | "No rule at this level" | Not represented in schema or templates | 19 such findings in key | No record is emitted for an absent rule; precision matters (no city duplicate of a state law). |
| 11 | T4 | "pending for every Boston and Cambridge address; affected set = all MA addresses if enacted" | Same | All 110 MA sample addresses are Boston or Cambridge. |
| 12 | Link-only sources | README §6: publishers "read freely; respect terms, no bulk scraping" | Supplemental captures kept separate | 10 pages captured earlier are in `supplemental/` with their own headers. Hoboken and Newark code pages (ecode360) and Justia returned 403 to a script. Citation credit for supplemental quotes is unconfirmed. |

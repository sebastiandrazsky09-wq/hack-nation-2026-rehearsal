# STATUS — Ordinal (Challenge 02, Rental Housing Law Navigator)
Updated: 3 Oct 21:15 CEST · Deadline: Sun 4 Oct 15:00 CEST (freeze 14:00) · Next: change engine (T1–T5), then sources for Hoboken, Jersey City and Newark

| Metric | Current | Target | Updated | Owner |
|---|---:|---:|---|---|
| Contracts frozen | yes (amended after PROOF) | yes | 20:50 | CONTROL |
| Milestone 1 vertical slice | **done 21:05** | 23:30 | 21:05 | CONTROL |
| Official captured docs processed | **54 / 54** | 54 | 21:15 | BUILD-1 |
| Supplemental docs processed | 10 / 10 held | — | 21:15 | BUILD-1 |
| Extraction failures | 0 | 0 | 21:15 | BUILD-1 |
| Extracted candidates → consolidated rules | 87 → **52** | ~58 in key (unverified) | 21:15 | BUILD-1 |
| Verified quoted spans | **52 / 52 (100%)** | 100% | 21:15 | BUILD-1 |
| Unverified affirmative exports | **0** | 0 | 21:15 | BUILD-2 |
| Rules whose only source is team-captured | 5 | — | 21:15 | CONTROL |
| Jurisdiction × category cells with no rule | 38 of 78 (key reportedly 19) | — | 21:15 | CONTROL |
| Addresses resolved | **500 / 500** (geocoder 493, postal fallback 7) | 500 | 21:00 | BUILD-2 |
| Lookups generated | **500 / 500**, 4,924 rows | 500 | 21:15 | BUILD-2 |
| Result mix at 2026-10-01 | applies 3,187 · unknown 1,082 · pending 320 · superseded 195 · not yet effective 140 | — | 21:15 | BUILD-2 |
| Rule-record schema validity | **52 / 52**, 0 errors | 100% | 21:15 | BUILD-2 |
| `rules.json` / `lookups.json` | written, schema-valid | valid | 21:15 | BUILD-2 |
| `changes.json` | not built | valid | 21:15 | BUILD-2 |
| T1 / T2 / T3 / T4 / T5 | not run (T2 and T3 flags lack Hoboken and Jersey City texts) | pass | 21:15 | CONTROL |
| Unseen-law rehearsals | 0 | 2 | 21:15 | CONTROL |
| Real T6 | unverified it exists | — | 21:15 | PO |
| Selfcheck | **ok**, 0 failures | ok | 21:15 | CONTROL |
| Unit tests | 104 pass | pass | 21:15 | CONTROL |
| Build / e2e | pass (2 smoke tests) | pass | 21:15 | CONTROL |
| Deterministic rerun | export twice byte-identical (selfcheck) | pass | 21:15 | BUILD-2 |
| Deployment URL | none | live | 21:15 | CONTROL |
| UI | skeleton page live locally; UI task running | minimum UI | 21:15 | UI |
| Submission: public repo, README, method note, 3 videos, HackOS | none | all | 21:15 | PO + CONTROL |

## Risk
- **No provider API key exists** (`.env.local` keys are empty). Extraction runs on Claude Sonnet 5.5 through the Claude Code login: 111 calls so far. It shares the weekly limit with the workers and the lead.
- **Hoboken, Newark and most Jersey City law has no readable text** (code publisher pages return 403 to scripts). 17 of the 38 empty cells are in those three cities; T2 and the T3 conflict flags depend on them. Official city pages for the two algorithmic bans exist and are readable.
- Hour-16 release contradicts the pack brief; scorer and answer key absent (see `docs/RECONCILIATION.md`).
- Missing unit counts make every unit-dependent rule `unknown` for 242 addresses, by the README's guidance. Whether the key expects that when the use code implies five or more units is not known.
- Extraction quality is unreviewed beyond one document: effective dates on three San Francisco rules are rate-period dates, and one conflict flag (CA deposits) may be spurious.

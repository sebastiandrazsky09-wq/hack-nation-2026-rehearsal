# STATUS — Ordinal (Challenge 02, Rental Housing Law Navigator)
Updated: 3 Oct 21:00 CEST · Deadline: Sun 4 Oct 15:00 CEST (freeze 14:00) · Next: Milestone 1 vertical slice, target 23:30

| Metric | Current | Target | Updated | Owner |
|---|---:|---:|---|---|
| Contracts frozen | yes | yes | 21:10 | CONTROL |
| Official captured docs processed | 0 / 54 | 54 | 21:10 | BUILD-1 |
| Supplemental docs processed | 0 / 10 held | — | 21:10 | BUILD-1 |
| Extracted rules | 0 | — | 21:10 | BUILD-1 |
| Verified quoted spans | — | 100% | 21:10 | BUILD-1 |
| Unverified affirmative exports | — | 0 | 21:10 | BUILD-2 |
| Addresses resolved | 0 / 500 | 500 | 21:10 | BUILD-2 |
| Lookups generated | 0 / 500 | 500 | 21:10 | BUILD-2 |
| Rule-record schema validity | not run | 100% | 21:10 | BUILD-2 |
| `rules.json` / `lookups.json` / `changes.json` | none | valid | 21:10 | BUILD-2 |
| T1 / T2 / T3 / T4 / T5 | not run | pass | 21:10 | CONTROL |
| Unseen-law rehearsals | 0 | 2 | 21:10 | CONTROL |
| Real T6 | unverified it exists | — | 21:10 | PO |
| Unit tests | 28 pass | pass | 21:10 | CONTROL |
| Build / e2e (starter app) | pass at a55ce48 | pass | 21:10 | CONTROL |
| Deterministic clean rerun | not run | pass | 21:10 | PROOF |
| Deployment URL | none | live | 21:10 | CONTROL |
| Submission: public repo, README, method note, 3 videos, HackOS | none | all | 21:10 | PO + CONTROL |

## Risk
- **Live extraction needs a provider key decision** (PO): none made yet; workers build against a fake client.
- **Claude weekly limit** was at 86% at 15:52; workers and lead share it.
- Hour-16 release contradicts the pack brief; scorer and key absent (see `docs/RECONCILIATION.md`).
- Hoboken and Newark ordinances have no readable source yet (403 to scripts); T2 depends on a Hoboken text.
- Codex QA path (PROOF) has never been run.

# STATUS — Ordinal (Challenge 02, Rental Housing Law Navigator)
Updated: 3 Oct 21:55 CEST from observed runs at commit `8a5962e` · Deadline: Sun 4 Oct 15:00 CEST (freeze 14:00) · Next: Jersey City source, unknown-policy decision, deployment

| Metric | Current | Target | Updated | Owner |
|---|---:|---:|---|---|
| Milestone 1 vertical slice | done 21:05 | 23:30 | 21:05 | CONTROL |
| Milestone 2 full pipeline | done 21:15, re-extracted 21:45 (prompt v4) | 04:00 | 21:45 | CONTROL |
| Official captured docs processed | **54 / 54** | 54 | 21:45 | BUILD-1 |
| Team-captured pages for link-only sources | 10 / 10 held | — | 21:45 | BUILD-1 |
| Added documents (official pages outside the pack) | 2 (Hoboken notice, San Diego code division) | — | 21:45 | CONTROL |
| Extraction failures | 0 | 0 | 21:45 | BUILD-1 |
| Candidates → consolidated rules | 101 → **58** | key reportedly 58 (unverified) | 21:45 | BUILD-1 |
| Verified quoted spans | **58 / 58 (100%)** | 100% | 21:50 | BUILD-1 |
| Unverified affirmative exports | **0** | 0 | 21:50 | BUILD-2 |
| Citation tokens not found in source | 14 rules (citation is a name, not a number) | — | 21:50 | CONTROL |
| Rules whose only source is team-captured | 5 | — | 21:50 | CONTROL |
| Effective dates rejected by the date guard | 6 (5 California amendment notes, 1 Massachusetts version note) | — | 21:50 | CONTROL |
| Jurisdiction × category cells with no rule | 36 of 78 (key reportedly 19) | — | 21:50 | CONTROL |
| Addresses resolved | **500 / 500** (geocoder 493, postal fallback 7) | 500 | 21:00 | BUILD-2 |
| Lookups generated | **500 / 500**, 5,708 rows | 500 | 21:50 | BUILD-2 |
| Result mix at 2026-10-01 | applies 3,277 · unknown 1,748 · superseded 273 · pending 270 · not yet effective 140 | — | 21:50 | BUILD-2 |
| Rule-record schema validity | **58 / 58**, 0 errors | 100% | 21:50 | BUILD-2 |
| `rules.json` / `lookups.json` / `changes.json` | written, valid | valid | 21:50 | BUILD-2 |
| T1 (CA AB 325, two dates) | **250** CA addresses change, not yet effective → applies | pass | 21:50 | CONTROL |
| T2 (Hoboken vs Jersey City) | Hoboken 40 correct; **Jersey City rule missing** (warning, not failure) | pass | 21:50 | CONTROL |
| T3 (NJ FAIR Act) | **140** NJ addresses change; conflict flags on Hoboken 40, **Jersey City 0 of 50** | pass | 21:50 | CONTROL |
| T4 (MA pending bills) | **110** MA addresses, both bills pending | pass | 21:50 | CONTROL |
| T5 (MA ballot question) | **0** affected, proposal recorded failed | pass | 21:50 | CONTROL |
| Unseen-law rehearsals | 1 synthetic pass (zero code changes); 2 real documents ingested the same way | 2 | 21:20 | CONTROL |
| Real T6 | unverified it exists | — | 21:15 | PO |
| Selfcheck | **ok**, 0 failures | ok | 21:50 | CONTROL |
| Offline rebuild | twice, 0 model calls, 0 changed files, identical hashes | byte-identical | 21:48 | CONTROL |
| Unit tests | 131 pass | pass | 21:50 | CONTROL |
| Build / browser tests | pass / 19 pass | pass | 21:50 | CONTROL |
| Queue tests (`test-ops.py`) | pass | pass | 21:50 | CONTROL |
| Secret scan (`gitleaks git`) | no leaks | none | 21:50 | CONTROL |
| Hardcoding scan of `src/` | no test ids, organizer ids, address ids or expected sets | none | 21:40 | CONTROL |
| UI | address search, as-of control, jurisdiction, rule cards, audit table, changes and pipeline tabs | minimum UI | 21:20 | UI |
| Deployment URL | none (Vercel project linked, build ready) | live | 21:15 | PO decision |
| Submission: public repo, 3 videos, HackOS | none | all | 21:15 | PO + CONTROL |
| README, method note | written | done | 21:25 | CONTROL |

No answer key or scorer exists. Every "pass" above means our general engine produced the set described; none is measured against the organizers' expectations.

## Checkpoint `9307f31` → `8a5962e`
| | Before | After | Why |
|---|---:|---:|---|
| Rules | 53 | 58 | New Jersey just cause 1 → 5 and rent 1 → 2 (separate acts now separate records); Los Angeles just cause 2 → 3 (two ordinances no longer merged); Cambridge tenant-notice ordinance found; California just cause 1 → 2 (a rent-notice rule, probably misfiled); Massachusetts just cause 4 → 2 and Berkeley 2 → 1 (merged) |
| Filled cells | 41 | 42 | Cambridge tenant-notice ordinance |
| Unknown rows | 1,082 | 1,748 | New Jersey small-building exemptions now carry their unit condition, and NJ addresses have no unit count (+~700); Boston policy limited to funded providers (+60) |
| Superseded rows | 195 | 273 | California rent cap now yields to local rent control |
| California rent cap | unknown 245 | superseded 126 · applies 21 · unknown 98 · exempt 5 | separately-sold-home exemption now needs one unit; remaining unknowns are missing year built or units |
| Effective dates the date guard rejects | 7 | 0 | 4 amendment or version notes and 3 San Francisco rate-period starts; now blocked mechanically at compile and checked at selfcheck |
| San Diego algorithmic ban | pending | enacted, effective 2025-06-21 | city code captured; an adopted code outranks a draft |
| T1 / T4 / T5 | 250 / 110 / 0 | 250 / 110 / 0 | unchanged |

## Risk
- **Jersey City's algorithmic ban has no admissible source.** The official ordinance PDF is on a portal whose robots.txt disallows every automated agent. T2 and the T3 conflict flags stay incomplete until someone saves that document by hand.
- **Unknown policy decides about 670 answers.** With unit bounds from the use description switched on, unknown falls from 1,748 to 1,079. It is off, following the participant guide literally. Mentor question.
- **Known extraction defects still in the store:** San Francisco's rent rule lacks its 1979 certificate cutoff; one New Jersey rule on new construction has its coverage inverted; one Berkeley exemption lacks a unit condition; a state rent-notice rule is filed under just cause; New Jersey just cause has five records where the key probably has one.
- **No provider API key.** Extraction runs through the Claude Code login: roughly 420 Sonnet calls so far across four full passes. It shares the weekly limit with the lead and workers.
- Hoboken (except its algorithmic ban) and Newark have no readable source at all: 11 empty cells.
- Hour-16 release contradicts the pack brief; scorer and key absent (see `docs/RECONCILIATION.md`).

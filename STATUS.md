# STATUS — Ordinal (Challenge 02, Rental Housing Law Navigator)
Updated: 4 Oct 02:15 CEST · Legal-gate build in progress on `integration`; fallback release tagged `baseline-19665a3`; production still serves `6c16f09` · Deadline: Sun 4 Oct 15:00 CEST (freeze 14:00)

| Metric | Current | Target | Updated | Owner |
|---|---:|---:|---|---|
| Milestone 1 vertical slice | done 21:05 | 23:30 | 21:05 | CONTROL |
| Milestone 2 full pipeline | done 21:15, re-extracted 21:45 (prompt v4) | 04:00 | 21:45 | CONTROL |
| Official captured docs processed | **54 / 54** | 54 | 21:45 | BUILD-1 |
| Team-captured pages for link-only sources | 10 / 10 held | — | 21:45 | BUILD-1 |
| Added documents (official pages outside the pack) | 2 (Hoboken notice, San Diego code division) | — | 21:45 | CONTROL |
| Extraction failures | 0 | 0 | 21:45 | BUILD-1 |
| Candidates → consolidated rules | 100 → **57** | key reportedly 58 (unverified) | 22:30 | BUILD-1 |
| Verified quoted spans | **57 / 57 (100%)**; 52 from supplied texts, 4 team-captured, 1 added | 100% | 00:13 | BUILD-1 |
| Unverified affirmative exports | **0** | 0 | 21:50 | BUILD-2 |
| Citation tokens not found in source | 13 rules (citation is a name, not a number) | — | 00:13 | CONTROL |
| Rules whose only source is team-captured | 5 | — | 21:50 | CONTROL |
| Effective dates rejected by the date guard | 5 California amendment notes; a current-text version note is accepted (MA c.112 §87DDD½, 2025-08-01) | — | 22:30 | CONTROL |
| Jurisdiction × category cells with no rule | 36 of 78 (key reportedly 19) | — | 00:13 | CONTROL |
| Addresses resolved | **500 / 500** (geocoder 493, postal fallback 7) | 500 | 21:00 | BUILD-2 |
| Lookups generated | **500 / 500**, 5,458 rows | 500 | 00:13 | BUILD-2 |
| Result mix at 2026-10-01 | applies 3,027 · unknown 1,748 · superseded 273 · pending 270 · not yet effective 140 | — | 00:13 | BUILD-2 |
| Rule-record schema validity | **57 / 57**, 0 errors; also by an independent Python verifier | 100% | 22:30 | BUILD-2 |
| `rules.json` / `lookups.json` / `changes.json` | written, valid | valid | 21:50 | BUILD-2 |
| T1 (CA AB 325, two dates) | **250** CA addresses change, not yet effective → applies | pass | 00:13 | CONTROL |
| T2 (Hoboken vs Jersey City) | Hoboken 40 correct; **Jersey City rule missing** (warning, not failure) | pass | 00:13 | CONTROL |
| T3 (NJ FAIR Act) | **140** NJ addresses change; conflict flags on Hoboken 40, **Jersey City 0 of 50** | pass | 00:13 | CONTROL |
| T4 (MA pending bills) | **110** MA addresses, both bills pending | pass | 00:13 | CONTROL |
| T5 (MA ballot question) | **0** affected, proposal recorded failed | pass | 00:13 | CONTROL |
| Unseen-law rehearsals | **2 of 2** synthetic ordinances pass with zero code changes; 2 real documents ingested the same way | 2 | 22:27 | CONTROL |
| Selfcheck | **ok**, 0 failures | ok | 00:13 | CONTROL |
| Offline rebuild (`ordinal demo`) | three times, 0 model calls, 0 changed files | byte-identical | 00:13 | CONTROL |
| Unit tests | 140 pass | pass | 23:42 | CONTROL |
| Build / browser tests | pass / 39 pass (28 earlier, 11 added with the redesign) | pass | 23:42 | CONTROL |
| Independent submission verifier (`npm run verify`) | 0 problems | 0 | 00:13 | CONTROL |
| PROOF (Codex) | **unavailable**: usage limit reached, resets 10 Oct | available | 22:28 | PO decision |
| Queue tests (`test-ops.py`) | pass | pass | 23:40 | CONTROL |
| Secret scan (`gitleaks git`) | no leaks | none | 21:50 | CONTROL |
| Hardcoding scan of `src/` | no test ids, organizer ids, address ids or expected sets | none | 21:40 | CONTROL |
| UI | redesigned (`docs/DESIGN.md`) and integrated at `5750df8`: answer sentence first, rules as lines in time under a movable as-of date, evidence opens in place, changed answers marked, change cases on a time scale; contrast and accessible-name checks pass; **not deployed, waiting for PO approval** | judge-ready | 00:14 | CONTROL |
| Deployment URL | **https://hack-nation-machine-rehearsal.vercel.app** (deployed 22:58 from clean `6c16f09`) | live | 23:03 | CONTROL |
| Production health check | `/api/health` ok: 57 rules, 500 addresses | ok | 23:00 | CONTROL |
| Production browser tests (fresh context, no login) | 28 / 28 pass | pass | 23:02 | CONTROL |
| Production answers vs `out/` files | 45 addresses (501 rows), 57 rules and T1–T5 identical | identical | 23:03 | CONTROL |
| Submission: public repo (held back on PO instruction), 3 videos, HackOS | none | all | 23:05 | PO + CONTROL |
| README, method note, demo and tech video scripts | written | done | 22:30 | CONTROL |

## Legal gate build (4 Oct)
Goal: a deterministic decision layer over the unchanged engine: `check(subject, action, resource, context) -> PASS | BLOCK | REQUIRE | REVIEW` with determining rules, trace and quoted evidence. Three actions (algorithmic rent-setting, security deposit, application fee). The engine, the rule store and the scored outputs are protected.

| Phase 0 baseline at `19665a3`, 01:52 | Result |
|---|---|
| `npm run check` | 140 unit tests pass, typecheck clean, secret guard pass |
| `npm run build` | pass |
| `npm run test:e2e` | 39 pass |
| `npm run ordinal -- demo` | 0 model calls, 0 changed files, selfcheck passed |
| `npm run verify` | 0 problems |
| Protected hashes (sha256 prefix) | `out/rules.json 99e9004464cc68e4` · `out/lookups.json 7421607ab6fb4d12` · `out/changes.json 642081c735299147` · `store/rules.jsonl b1cf9c7a84903935` · `store/stacks.json ce00118ee28719d4` |
| T1 to T5 (affected / conflict-flagged) | 250/0 · 40/40 · 140/40 · 110/0 · 0/0 |
| Supplemental New Jersey sources (5.6) | not present locally; requested from the PO at 01:56 |

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

## Since `fb4353d`
- Merged `task/date-guard-version-note` after it passed the gate here (one rule changes: MA broker-fee statute effective 2025-08-01).
- §1950.5: the targeted re-extraction of D025 was rejected (date still empty, rule id changed) and the baseline restored. The date 2024-07-01 now comes from a merge rule with no model call: a date another document of the same law states is adopted when the primary text states it too. One field of one rule changed; `lookups.json` and `changes.json` stayed byte-identical.
- Targeted re-extraction of D042 accepted: it removes a state rent-notice rule that had no citation and was filed under just cause (250 rows). Nothing else changed.
- Explanations in `lookups.json` name missing facts in words, report use-description unit bounds without using them, and mark answers that rest on a postal-fallback city.

## Risk
- **Jersey City's algorithmic ban has no admissible source.** The official ordinance PDF is on a portal whose robots.txt disallows every automated agent. T2 and the T3 conflict flags stay incomplete until someone saves that document by hand.
- **Unknown policy decides about 670 answers.** With unit bounds from the use description switched on, unknown falls from 1,748 to 1,079. It is off, following the participant guide literally. Mentor question.
- **Known extraction defects still in the store:** San Francisco's rent rule lacks its 1979 certificate cutoff; one New Jersey rule on new construction has its coverage inverted; one Berkeley exemption lacks a unit condition; New Jersey just cause has five records where the key probably has one. No further full extraction is planned.
- **Independent review is down.** The Codex account behind PROOF hit its usage limit; the pre-freeze review did not complete.
- **No provider API key.** Extraction runs through the Claude Code login and shares the weekly limit with the lead and workers.
- Hoboken (except its algorithmic ban) and Newark have no readable source at all: 11 empty cells.

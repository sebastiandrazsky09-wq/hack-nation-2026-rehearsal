# STATUS — Ordinal (Challenge 02, Rental Housing Law Navigator)
Updated: 4 Oct 08:45 CEST · Production serves the first gate interface (`b06d28c`, tagged `gate-v1-deployed`). A new product design is built and gated on `integration`, **not deployed**, waiting for PO approval (`.ops/redesign/design-approval.html`) · Deadline: Sun 4 Oct 15:00 CEST (freeze 14:00)

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
| UI | the legal gate: `/` Check, `/portfolio`, `/record`, `/changes`, `/system`; design system in `docs/DESIGN.md` | judge-ready | 07:35 | CONTROL |
| Deployment URL | **https://hack-nation-machine-rehearsal.vercel.app** serves the legal gate (deployed 07:24 from clean `b06d28c`) | live | 07:35 | CONTROL |
| Production health check | `/api/health` ok: 57 rules, 500 addresses; `/api/v1/system`: ruleset `70ebdca11f01` (equal to the local store), 33 constraints verified, 3 withheld; a decision is in the first HTML of `/` | ok | 07:27 | CONTROL |
| Production browser tests (fresh context, no login) | 76 / 76 pass against the production URL; five security headers present, no CSP violation | pass | 07:33 | CONTROL |
| Production answers vs `out/` files | 50 addresses (544 rows, result and conflict flag), 57 rule ids and T1 to T5 affected and conflict sets identical | identical | 07:28 | CONTROL |
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

| Gate build, state at 02:25 | Result |
|---|---|
| Contract | `src/gate/contract.ts` frozen at 02:00: request, response, constraint record, three actions |
| Constraint compile step (`ordinal constrain`) | 21 rules in the three action categories; **33 constraints verified, 3 withheld**. First live pass was read record by record and re-run with a stricter verifier after it produced unsafe records (a conditional two-month cap read as the general cap; a renewal-fee ban read as an application-fee ban; a table row accepted as a duty; adjustable caps read as fixed). The three withheld are lead rejections in `store/constraints.review.json`. Replays offline with 0 model calls and an identical file |
| Cut line 05:30 (deposit and fee constraints verified) | met at 02:10; the fallback was not needed |
| Decision layer | `decide()` pure, every branch tested; `check()`, `checkBatch()`; `POST /api/v1/check`, `POST /api/v1/checks`, `GET /api/v1/actions`, `GET /api/v1/system` |
| What the verified data decides (2026-10-01) | Pricing-algorithm action over 500 properties: BLOCK 130 (San Francisco, San Diego), REVIEW 260, PASS 110 (Massachusetts: pending bills only). The FAIR Act and the Hoboken ban come out as REVIEW (their verified quotes make the ban depend on coordination or agreement), not BLOCK. Deposit of 2 months: BLOCK 110, REVIEW 390 (249 BLOCK once a missing unit count is supplied) |
| Known gaps (force REVIEW, never PASS) | Jersey City algorithmic ban (named by change test T2, no source); Newark and Hoboken in every gated category where no rule is stored and none of their listed sources could be read |
| Batch time | about 10 ms for 500 properties, measured in process |
| Adversarial tests | every property x 3 actions x 4 dates (and again with a supplied unit count): no permit with an unknown rule, an unmodeled or prohibiting applying rule, a conflict or a known gap; only rules in force determine; conflicts never disappear; served constraints are literal slices and their figures parse; caller facts never override the record; decision ids are stable |
| Security | CSP and four other headers on every response; source links only for http and https; POST bodies capped at 16 KB with JSON errors that carry no stack or path; `gitleaks git`: no leaks; `npm audit`: 0 vulnerabilities |
| Protected paths | the five hashes above unchanged after every merge. `src/ordinal/cli.ts` gained one dispatch entry for `constrain`; nothing else under `src/ordinal/` changed |
| Tests at 02:25 | 259 unit, 47 browser, build passing |
| Screens | `/` Check (a real decision in the first HTML), `/portfolio`, `/record`, `/changes`, `/system` with compile and decision planes; legacy `?tab=` and `?address=` links still land where they did |
| Visual passes | three, with written critiques (`docs/handoffs/gate-visual-passes.md`); state sweep of 19 states at 1440, 1024 and 390: no overflow, no console error |
| Demo rehearsal (`scripts/demo-rehearsal.mjs`) | 5 of 5 runs pass on the production build, identical; every step checked against the API; slowest gate round trip 33 ms |
| Final gate at 03:06 | 260 unit, 76 browser, build, `ordinal demo` with 0 changed files, `constrain --offline` with 0 model calls, `verify` 0 problems, protected hashes equal to baseline, `gitleaks` no leaks, `npm audit` 0 |
| 03:58 check | `npm run check` 260 unit tests pass; `ordinal demo` 0 model calls, 0 changed files; no new source file in `supplemental/extra/`, the repo root, `.ops/transfer/` or Downloads; the pitch deck and sheet left in `.ops/transfer/` at 02:33 match the gate's current answers (decisions, addresses, dates, 33 of 36 constraints, 260 of 500 REVIEW) |
| Production demo rehearsal, 07:31 | `node scripts/demo-rehearsal.mjs https://hack-nation-machine-rehearsal.vercel.app 5`: 5 of 5 runs pass and are identical; slowest gate round trip 246 ms, slowest server evaluation 35 ms |
| One test changed after deployment | the Check keyboard test now accepts a check request that the page itself cancelled as superseded; on a real network two checks can overlap, locally they never did. App code in production is unchanged |
| Product design pass, 08:00 to 08:45 | The first gate interface was rejected by the PO as an internal dashboard. Redesigned from first principles after capturing about twenty real product sites: one grotesque (Host Grotesk) and a mono (Geist Mono), near-monochrome, the request as a sentence, the decision as one word at up to 136px, why, then the quoted sentence, the API call in a panel beside it, everything else behind disclosures. Portfolio, record, changes and system share the system (`docs/DESIGN.md`). No backend, contract or decision change |
| Cut | `/developers` page (the three endpoints are live and shown through the request panel and `GET /api/v1/actions`); optional engine fact extension 5.5. Nothing from the demo was cut |
| What the demo shows instead of the brief's guess | step 2 uses Los Angeles (PASS before AB 325 takes effect, REVIEW after) because Newark is REVIEW for a source gap at every date; step 3 uses Jersey City because Newark deposits also sit in that gap; the portfolio step compares 6 Oct 2025 with 1 Jan 2026 (80 properties change) |
| Residue removed | Supabase dependencies, starter contract file, T6 and hour-16 text (the pack names T1 to T5 only) |

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

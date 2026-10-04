# Demo scripts (each video at most 60 seconds)

Run locally with `npm run build && npm run start`, or on the deployed URL. Every screen carries "Not legal advice".

## Demo video: the decision gate (60 to 90 seconds)
One argument: software proposes a consequential action; the gate says which external rules govern it here and now, refuses to guess when a fact is missing, takes the fact, and returns a decision backed by the exact source. Every word on screen comes from the API. `node scripts/demo-rehearsal.mjs <url> 5` rehearses these five steps and checks each against the API.

| Step | Do | What the verified data shows | Say |
|---|---|---|---|
| 1 | Open `/`. | BLOCK at a San Francisco property, pricing-algorithm action, 1 Oct 2026. Determining rule: Section 37.10C of the Rent Ordinance, with its quoted sentence and source. | "A pricing tool wants to set rents with competitor data. The gate answers before it acts: blocked, by this rule, proven by this sentence." |
| 2 | Property: a Los Angeles address. Then press "6 Oct 2025: AB 325 ... is enacted", then "1 Jan 2026: ... takes effect". | REVIEW in Los Angeles (the state act bans the conduct only as part of a contract, conspiracy or coercion, which the gate cannot observe). PASS on 6 Oct 2025, REVIEW from 1 Jan 2026, with "Was PASS". | "Same action, another city: no local ban, and the state act is conditional, so the gate does not guess. Move the date and the answer moves with the law." |
| 3 | Action: collect a security deposit, 2 months, at a Jersey City address with no unit count. Enter 24 units. Change the amount to 1.5. | REVIEW naming the missing unit count; with units supplied, BLOCK against N.J.S.A. 46:8-21.2 ("one and one-half times one month's rent"); at 1.5 months, REQUIRE with two duties. | "It says what it does not know, takes the fact, and decides. Lower the amount and it passes, with the duties that attach." |
| 4 | Open Portfolio, pricing-algorithm action, 6 Oct 2025; press the 1 Jan 2026 change point. | 500 properties; 80 change between the two dates; counts and grid update. | "The same check across the portfolio, in milliseconds, and what changes when the law does." |
| 5 | Back on `/`, open "Request and response"; then `/system`. | The exact request and response, a curl that reproduces the decision id; compile plane and decision plane with counted figures. | "It is an API. A model helps compile the law ahead of time and is verified; no model runs on a request." |

Backups, one per step, all verified through the API: (1) a San Diego address gives BLOCK on its own ordinance; (2) a Berkeley address gives REVIEW on a conditional local ban, and Boston gives PASS with two pending bills listed as upcoming; (3) any Boston or Cambridge address: a deposit of 2 months is BLOCK with no missing fact, 1 month is REQUIRE; (4) the deposit action across the portfolio; (5) `GET /api/v1/actions`.

What not to claim: PASS is not "legal"; the decision id is not an audit log; rent increases, eviction and screening are not gated; the FAIR Act and the Hoboken ban come out as REVIEW because their verified quotes make the ban conditional; Jersey City is REVIEW for a known source gap.

## The navigator behind it (for the challenge's own criteria)
`/record` shows every rule at an address on a date with its source sentence; `/changes` shows the five official change cases (T1 to T5); `/system` shows the rule registry and the selfcheck.

## Tech video: how it is produced
| Seconds | Do | Say |
|---|---|---|
| 0–10 | Terminal: `npm run ordinal -- demo`. | "The whole pipeline, replayed from the committed store with no model call: 66 documents, every rule with a quote found character for character in its source." |
| 10–25 | Show `store/rules.jsonl` for one rule, then the same quote in the source text file. | "A language model proposes structured rules. Code then checks each quote against the file, checks how each date is worded, and merges documents about the same law. The model never decides whether a rule applies." |
| 25–40 | Terminal: `rehearsal/run.sh rehearsal/synthetic_cambridge_2.txt 2027-04-02`. | "A law it has never seen: one command. It reads the jurisdiction, the category, the effective date written as 'the seventh month following passage', and the unit and age conditions, then lists the 48 Cambridge addresses that change. No code was edited." |
| 40–52 | Open "How it was produced" in the app; show the selfcheck. | "Selfcheck fails the build if a quote stops matching its source, a pending bill shows as in force, or two exports differ by a byte." |
| 52–60 | Show `out/` and `python3 scripts/verify-submission.py`. | "Three submission files, verified by an independent script against the official schema." |

## Before recording
Seeded browser tab, terminal font large, `npm run ordinal -- demo` already run once (warm disk cache). Never show a fixture as live: the extraction replay says "replayed from cache" on screen.

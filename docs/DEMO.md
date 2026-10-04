# Demo scripts (each video at most 60 seconds)

Run locally with `npm run build && npm run start`, or on the deployed URL. Every screen carries "Not legal advice".

## Before presenting or recording
Open `/`, `/portfolio` and `/system` once before you start. A page that has been idle can take a few seconds to load the first time. The Check page warms its own API function when it loads, so once the page is up the first change is fast (the server's own evaluation is under 40 ms).

## Demo video: the envelope (60 seconds)
One argument: an agent plans, so it needs the law as a constraint set, not a verdict on one request. Mortise returns what is permitted, what fact decides it and until when, with the quoted sentence; a specific request is the same computation at one point. Every word on screen comes from `POST /api/v1/envelope` or `POST /api/v1/check`.

| Time | Do | What the verified data shows | Caption |
|---|---|---|---|
| 0:00 | Open `/`. | BLOCK at a San Francisco property, pricing-algorithm action, 1 Oct 2026, with Section 37.10C quoted. The Envelope section under it: BLOCK from 14 Oct 2024, PASS before. | "A gate can say no." |
| 0:10 | Property: 1065 Summit Avenue, Jersey City. Action: collect a security deposit. Clear the amount. | The decision gives way to the envelope. Permitted: "Not computable until the number of units is known". Decides: 1 to 3 units REVIEW at any amount; 4 or more units REQUIRE up to 1.5 months, BLOCK above. | "The agent asks what is permitted, not whether." |
| 0:22 | Enter 24 units in the Decides row. Then type 2 as the amount, then 1.5. | Permitted: "Up to 1.5 months of rent", N.J.S.A. 46:8-21.2, "one and one-half times one month's rent". At 2 months BLOCK; at 1.5 REQUIRE with two duties. | "No guessing. No retry loop." |
| 0:36 | Action: charge an application fee, amount empty, same property. Press the first row under Until. | Until 30 Apr 2026 PASS at any amount; from 1 May 2026 PASS up to $50 (P.L. 2025, c.405), REVIEW above because the cap may be adjusted. Pressing the row moves the date and the envelope changes. | "The envelope has a date." |
| 0:46 | Portfolio, pricing-algorithm action, 6 Oct 2025, then the 1 Jan 2026 change point. | 500 properties; 80 change between the two dates. | "500 properties, measured milliseconds." |
| 0:54 | Back on `/`: the Envelope tab of the request panel (the curl), then `/system` for two seconds. | The exact call; compile plane and decision plane with an Envelope line. | "Don't ask the law for permission. Ask it for the envelope." |

Where the data differs from the pivot brief, and what the demo uses instead: Newark is REVIEW at every date and amount for a known source gap, so the deposit step uses Jersey City. The FAIR Act's verified quote makes its ban conditional, so New Jersey does not turn BLOCK on 1 Jul 2027; the dated step uses the New Jersey application-fee cap (1 May 2026). A Los Angeles address shows the same on the pricing action: PASS until 31 Dec 2025, REVIEW from 1 Jan 2026 when AB 325 takes effect.

Backups, all read from the API: a Los Angeles deposit (REQUIRE up to 1 month, REVIEW above 1 up to 2, BLOCK above 2, from 1 Jul 2024); a Boston deposit (REQUIRE up to 1 month, BLOCK above); a Boston application fee (no amount is permitted); a Berkeley application fee (three intervals in 2026 only, because the source states its figure for that year). `node scripts/demo-rehearsal.mjs <url> 5` still rehearses the five decision steps of the earlier script against the API.

What to claim: "Returns the permitted range, the deciding facts and the dates on which the answer changes, for a proposed action on a specific property, from quote-verified compiled rules, with no model at runtime." "Same question, same envelope id." "Enumerated over the thresholds present in the compiled rules."

What not to claim: "symbolic" or "complete"; "legal" or "compliant" for a permitted interval; that it solves planning; any accuracy figure; that no competitor exists (say "we found none as of 4 October 2026"). PASS is not "legal"; an id is not an audit log; rent increases, eviction and screening have no envelope; Jersey City's pricing action is REVIEW for a known source gap.

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
